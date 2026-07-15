/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { getPercentageTargetTop } from '@/features/parallel-reader/utils/ScrollSync.ts';

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
