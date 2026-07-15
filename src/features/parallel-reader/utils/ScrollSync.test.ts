/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { getContentMovementTargetTop, getPercentageTargetTop } from '@/features/parallel-reader/utils/ScrollSync.ts';

test('applies a percentage offset from the left reader', () => {
    assert.equal(getPercentageTargetTop(250, 1000, 2000, 0.1, 'left'), 700);
});

test('reverses the percentage offset from the right reader', () => {
    assert.equal(getPercentageTargetTop(250, 1000, 2000, 0.1, 'right'), 300);
});

test('clamps percentage synchronization to the target scroll range', () => {
    assert.equal(getPercentageTargetTop(950, 1000, 2000, 0.2, 'left'), 2000);
    assert.equal(getPercentageTargetTop(50, 1000, 2000, 0.2, 'right'), 0);
});

test('handles non-scrollable readers during percentage synchronization', () => {
    assert.equal(getPercentageTargetTop(100, 0, 2000, 0.25, 'left'), 500);
    assert.equal(getPercentageTargetTop(100, 0, 0, 0.25, 'left'), 0);
});

test('keeps an aligned point while scaling different chapter lengths toward the end', () => {
    const sourceScrollableHeight = 28_000;
    const targetScrollableHeight = 138_000;
    const sourceOriginTop = 2_800;
    const targetOriginTop = 13_800;

    assert.equal(
        getContentMovementTargetTop(
            sourceOriginTop,
            sourceScrollableHeight,
            sourceOriginTop,
            targetScrollableHeight,
            targetOriginTop,
        ),
        targetOriginTop,
    );
    assert.equal(
        getContentMovementTargetTop(
            sourceScrollableHeight,
            sourceScrollableHeight,
            sourceOriginTop,
            targetScrollableHeight,
            targetOriginTop,
        ),
        targetScrollableHeight,
    );
    assert.equal(
        getContentMovementTargetTop(
            15_400,
            sourceScrollableHeight,
            sourceOriginTop,
            targetScrollableHeight,
            targetOriginTop,
        ),
        75_900,
    );
});

test('keeps an aligned point while scaling toward the beginning', () => {
    assert.equal(getContentMovementTargetTop(1_000, 10_000, 2_000, 50_000, 10_000), 5_000);
    assert.equal(getContentMovementTargetTop(0, 10_000, 2_000, 50_000, 10_000), 0);
});

test('clamps calibrated content movement when the source is at a boundary', () => {
    assert.equal(getContentMovementTargetTop(500, 10_000, 0, 20_000, 1_000), 1_950);
    assert.equal(getContentMovementTargetTop(12_000, 10_000, 2_000, 20_000, 1_000), 20_000);
    assert.equal(getContentMovementTargetTop(10_000, 10_000, 10_000, 20_000, 1_000), 1_000);
});
