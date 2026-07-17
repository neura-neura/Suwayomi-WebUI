/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { getContentMarkerTargetTop, getPercentageTargetTop } from '@/features/parallel-reader/utils/ScrollSync.ts';

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

test('maps rendered content between the two matching marker scenes', () => {
    assert.equal(getContentMarkerTargetTop(15_400, 28_000, 2_800, 25_200, 138_000, 13_800, 124_200), 75_900);
});

test('keeps the matching marker scenes exact and maps both outer ranges independently', () => {
    assert.equal(getContentMarkerTargetTop(2_000, 10_000, 2_000, 8_000, 50_000, 10_000, 40_000), 10_000);
    assert.equal(getContentMarkerTargetTop(8_000, 10_000, 2_000, 8_000, 50_000, 10_000, 40_000), 40_000);
    assert.equal(getContentMarkerTargetTop(1_000, 10_000, 2_000, 8_000, 50_000, 10_000, 40_000), 5_000);
    assert.equal(getContentMarkerTargetTop(9_000, 10_000, 2_000, 8_000, 50_000, 10_000, 40_000), 45_000);
});
