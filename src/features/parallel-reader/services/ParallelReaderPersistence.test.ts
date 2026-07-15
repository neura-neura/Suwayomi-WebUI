/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { ParallelReaderSideSelection } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import {
    getParallelReaderAlignmentKey,
    sanitizeParallelReaderAlignment,
} from '@/features/parallel-reader/services/ParallelReaderPersistence.ts';

const createSelection = (
    sourceId: string,
    mangaId: number,
    chapterId: number,
): Required<ParallelReaderSideSelection> => ({
    source: { id: sourceId, displayName: sourceId },
    manga: { id: mangaId, sourceId, title: `Manga ${mangaId}` },
    chapter: { id: chapterId, name: `Chapter ${chapterId}`, pageCount: 20, sourceOrder: chapterId },
});

test('creates an ordered identity for both selected chapters', () => {
    const left = createSelection('source-a', 1, 10);
    const right = createSelection('source-b', 2, 20);

    assert.equal(
        getParallelReaderAlignmentKey(left, right),
        'parallel-reader:alignment:v1:source-a:1:10::source-b:2:20',
    );
    assert.notEqual(getParallelReaderAlignmentKey(left, right), getParallelReaderAlignmentKey(right, left));
});

test('sanitizes persisted dimensions and positions', () => {
    const result = sanitizeParallelReaderAlignment(
        {
            anchors: [{ leftPage: 2, rightPage: 3 }],
            isSyncEnabled: false,
            leftPosition: { pageIndex: 100, progress: 2 },
            leftWidth: 90,
            rightPosition: { pageIndex: -10, progress: -1 },
            syncMode: 'percentage',
        },
        10,
        12,
    );

    assert.equal(result.leftWidth, 75);
    assert.deepEqual(result.leftPosition, { pageIndex: 9, progress: 1 });
    assert.deepEqual(result.rightPosition, { pageIndex: 0, progress: 0 });
    assert.deepEqual(result.anchors, [{ leftPage: 2, rightPage: 3 }]);
    assert.equal(result.isSyncEnabled, false);
    assert.equal(result.syncMode, 'percentage');
    assert.equal(result.version, 4);
});

test('restores calibrated lockstep synchronization with two ordered content markers', () => {
    const result = sanitizeParallelReaderAlignment(
        {
            lockstepCalibrated: true,
            lockstepMarkers: {
                start: {
                    left: { pageIndex: 1, progress: 0.25 },
                    right: { pageIndex: 3, progress: 0.5 },
                },
                end: {
                    left: { pageIndex: 8, progress: 0.75 },
                    right: { pageIndex: 9, progress: 0.25 },
                },
            },
            syncMode: 'lockstep',
            version: 2,
        },
        10,
        10,
    );

    assert.equal(result.lockstepCalibrated, true);
    assert.deepEqual(result.lockstepMarkers, {
        start: {
            left: { pageIndex: 1, progress: 0.25 },
            right: { pageIndex: 3, progress: 0.5 },
        },
        end: {
            left: { pageIndex: 8, progress: 0.75 },
            right: { pageIndex: 9, progress: 0.25 },
        },
    });
    assert.equal(result.syncMode, 'lockstep');
    assert.equal(result.version, 4);
});

test('requires two ordered markers before restoring lockstep synchronization', () => {
    const result = sanitizeParallelReaderAlignment(
        {
            lockstepCalibrated: true,
            lockstepMarkers: {
                start: {
                    left: { pageIndex: 5, progress: 0 },
                    right: { pageIndex: 5, progress: 0 },
                },
                end: {
                    left: { pageIndex: 5, progress: 0 },
                    right: { pageIndex: 8, progress: 0 },
                },
            },
            syncMode: 'lockstep',
        },
        10,
        10,
    );

    assert.equal(result.lockstepCalibrated, false);
    assert.equal(result.lockstepMarkers, undefined);
});

test('sanitizes persisted percentage offsets', () => {
    assert.equal(sanitizeParallelReaderAlignment({ percentageOffset: 0.35 }, 10, 10).percentageOffset, 0.35);
    assert.equal(sanitizeParallelReaderAlignment({ percentageOffset: 5 }, 10, 10).percentageOffset, 1);
    assert.equal(sanitizeParallelReaderAlignment({ percentageOffset: -5 }, 10, 10).percentageOffset, -1);
    assert.equal(
        sanitizeParallelReaderAlignment({ percentageOffset: Number.POSITIVE_INFINITY }, 10, 10).percentageOffset,
        0,
    );
    assert.equal(sanitizeParallelReaderAlignment({ percentageOffset: '0.5' }, 10, 10).percentageOffset, 0);
});

test('supplies version 4 pane-control defaults for legacy alignment data', () => {
    const result = sanitizeParallelReaderAlignment(
        {
            anchors: [{ leftPage: 2, rightPage: 3 }],
            syncMode: 'page',
            version: 1,
        },
        10,
        10,
    );

    assert.equal(result.lockstepCalibrated, false);
    assert.equal(result.percentageOffset, 0);
    assert.equal(result.leftReaderSettings.readingMode, 'continuous');
    assert.equal(result.leftReaderSettings.pageScaleMode, 0);
    assert.equal(result.rightReaderSettings.autoScroll.value, 5);
    assert.equal(result.version, 4);
});

test('sanitizes independent settings for both reader panes', () => {
    const result = sanitizeParallelReaderAlignment(
        {
            leftReaderSettings: {
                autoScroll: { smooth: false, value: 0.1 },
                pageGap: 100,
                pageScaleMode: 3,
                readingDirection: 1,
                readingMode: 'single',
                shouldStretchPage: true,
            },
            rightReaderSettings: {
                autoScroll: { smooth: 'no', value: Number.POSITIVE_INFINITY },
                pageGap: -10,
                pageScaleMode: 99,
                readingDirection: -1,
                readingMode: 'not-a-mode',
                shouldStretchPage: 'yes',
            },
        },
        10,
        10,
    );

    assert.deepEqual(result.leftReaderSettings, {
        autoScroll: { smooth: false, value: 0.5 },
        pageGap: 20,
        pageScaleMode: 3,
        readingDirection: 1,
        readingMode: 'single',
        shouldStretchPage: true,
    });
    assert.deepEqual(result.rightReaderSettings, {
        autoScroll: { smooth: true, value: 5 },
        pageGap: 0,
        pageScaleMode: 0,
        readingDirection: 0,
        readingMode: 'continuous',
        shouldStretchPage: false,
    });
});

test('discards a contradictory persisted anchor map', () => {
    const result = sanitizeParallelReaderAlignment(
        {
            anchors: [
                { leftPage: 2, rightPage: 4 },
                { leftPage: 3, rightPage: 2 },
            ],
        },
        10,
        10,
    );

    assert.deepEqual(result.anchors, []);
});
