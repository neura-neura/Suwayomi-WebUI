/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { PageAnchor } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import {
    mapContentRelativePosition,
    mapPageIndex,
    mapPagePosition,
    upsertPageAnchor,
    validatePageAnchors,
} from '@/features/parallel-reader/utils/PageMapping.ts';

const anchors: PageAnchor[] = [
    { leftPage: 0, rightPage: 0 },
    { leftPage: 10, rightPage: 11 },
    { leftPage: 20, rightPage: 22 },
];

test('maps by index when no anchors exist', () => {
    assert.equal(mapPageIndex(7, [], 'left-to-right', 20), 7);
    assert.equal(mapPageIndex(30, [], 'left-to-right', 20), 19);
});

test('interpolates and rounds unequal intervals', () => {
    assert.equal(mapPageIndex(5, anchors, 'left-to-right', 30), 6);
    assert.equal(mapPageIndex(15, anchors, 'left-to-right', 30), 17);
});

test('preserves the nearest anchor offset outside the anchored range', () => {
    const offsetAnchors = [
        { leftPage: 5, rightPage: 7 },
        { leftPage: 10, rightPage: 12 },
    ];

    assert.equal(mapPageIndex(2, offsetAnchors, 'left-to-right', 30), 4);
    assert.equal(mapPageIndex(15, offsetAnchors, 'left-to-right', 30), 17);
});

test('maps in both directions', () => {
    assert.equal(mapPageIndex(11, anchors, 'right-to-left', 30), 10);
    assert.equal(mapPageIndex(17, anchors, 'right-to-left', 30), 15);
});

test('preserves progress inside the mapped page', () => {
    assert.deepEqual(mapPagePosition({ pageIndex: 10, progress: 0.42 }, anchors, 'left-to-right', 30), {
        pageIndex: 11,
        progress: 0.42,
    });
});

test('maps relative content movement instead of copying rendered pixels', () => {
    const result = mapContentRelativePosition(
        { pageIndex: 4, progress: 0.75 },
        { pageIndex: 4, progress: 0.25 },
        { pageIndex: 7, progress: 0.4 },
        [],
        'left-to-right',
        20,
    );

    assert.equal(result.pageIndex, 7);
    assert.ok(Math.abs(result.progress - 0.9) < 0.000001);
});

test('uses page anchors while preserving movement relative to the aligned content', () => {
    const result = mapContentRelativePosition(
        { pageIndex: 11, progress: 0.6 },
        { pageIndex: 10, progress: 0.5 },
        { pageIndex: 11, progress: 0.5 },
        anchors,
        'left-to-right',
        30,
    );

    assert.equal(result.pageIndex, 12);
    assert.ok(Math.abs(result.progress - 0.6) < 0.000001);
});

test('allows content-relative movement to reach the end of the final page', () => {
    assert.deepEqual(
        mapContentRelativePosition(
            { pageIndex: 4, progress: 1 },
            { pageIndex: 4, progress: 0 },
            { pageIndex: 4, progress: 0 },
            [],
            'left-to-right',
            5,
        ),
        { pageIndex: 4, progress: 1 },
    );
});

test('validates contradictory and out of range anchors', () => {
    assert.deepEqual(validatePageAnchors(anchors, 21, 23), []);
    assert.deepEqual(
        validatePageAnchors(
            [
                { leftPage: 2, rightPage: 4 },
                { leftPage: 3, rightPage: 3 },
                { leftPage: 30, rightPage: 40 },
            ],
            20,
            20,
        ),
        ['anchors-not-strictly-increasing', 'left-page-out-of-range', 'right-page-out-of-range'],
    );
});

test('upserts anchors in left page order', () => {
    assert.deepEqual(upsertPageAnchor([{ leftPage: 5, rightPage: 5 }], { leftPage: 2, rightPage: 3 }), [
        { leftPage: 2, rightPage: 3 },
        { leftPage: 5, rightPage: 5 },
    ]);
    assert.deepEqual(upsertPageAnchor([{ leftPage: 2, rightPage: 3 }], { leftPage: 2, rightPage: 4 }), [
        { leftPage: 2, rightPage: 4 },
    ]);
});
