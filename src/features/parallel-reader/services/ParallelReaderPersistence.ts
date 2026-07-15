/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type {
    ParallelLockstepMarkers,
    ParallelPagePosition,
    ParallelReaderAlignmentState,
    ParallelReaderPaneSettings,
    ParallelReaderSideSelection,
} from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { validatePageAnchors } from '@/features/parallel-reader/utils/PageMapping.ts';
import { coerceIn } from '@/lib/HelperFunctions.ts';
import { ReaderPageScaleMode, ReadingDirection } from '@/features/reader/Reader.types.ts';

const AUTO_SCROLL_SPEED = { default: 5, max: 60, min: 0.5 } as const;
const PAGE_GAP = { default: 5, max: 20, min: 0 } as const;

export const PARALLEL_READER_LEFT_SELECTION_KEY = 'parallel-reader:left-selection:v1';
export const PARALLEL_READER_RIGHT_SELECTION_KEY = 'parallel-reader:right-selection:v1';
export const PARALLEL_READER_OPEN_KEY = 'parallel-reader:open:v1';

export const DEFAULT_PARALLEL_READER_PANE_SETTINGS: ParallelReaderPaneSettings = {
    autoScroll: {
        smooth: true,
        value: AUTO_SCROLL_SPEED.default,
    },
    pageGap: PAGE_GAP.default,
    pageScaleMode: ReaderPageScaleMode.WIDTH,
    readingDirection: ReadingDirection.LTR,
    readingMode: 'continuous',
    shouldStretchPage: false,
};

const createDefaultPaneSettings = (): ParallelReaderPaneSettings => ({
    ...DEFAULT_PARALLEL_READER_PANE_SETTINGS,
    autoScroll: { ...DEFAULT_PARALLEL_READER_PANE_SETTINGS.autoScroll },
});

export const DEFAULT_PARALLEL_READER_ALIGNMENT: ParallelReaderAlignmentState = {
    anchors: [],
    isSyncEnabled: true,
    leftReaderSettings: createDefaultPaneSettings(),
    leftPosition: { pageIndex: 0, progress: 0 },
    leftWidth: 50,
    lockstepCalibrated: false,
    lockstepMarkers: undefined,
    percentageOffset: 0,
    rightReaderSettings: createDefaultPaneSettings(),
    rightPosition: { pageIndex: 0, progress: 0 },
    syncMode: 'page',
    version: 4,
};

const getSelectionIdentity = ({ source, manga, chapter }: Required<ParallelReaderSideSelection>): string =>
    [source.id, manga.id, chapter.id].map(String).map(encodeURIComponent).join(':');

export const getParallelReaderAlignmentKey = (
    leftSelection: Required<ParallelReaderSideSelection>,
    rightSelection: Required<ParallelReaderSideSelection>,
): string =>
    `parallel-reader:alignment:v1:${getSelectionIdentity(leftSelection)}::${getSelectionIdentity(rightSelection)}`;

const sanitizePosition = (value: unknown, pageCount: number): ParallelPagePosition => {
    if (!value || typeof value !== 'object') {
        return { pageIndex: 0, progress: 0 };
    }

    const position = value as Partial<ParallelPagePosition>;
    return {
        pageIndex: coerceIn(
            Number.isInteger(position.pageIndex) ? position.pageIndex! : 0,
            0,
            Math.max(0, pageCount - 1),
        ),
        progress: coerceIn(typeof position.progress === 'number' ? position.progress : 0, 0, 1),
    };
};

const getPositionCoordinate = ({ pageIndex, progress }: ParallelPagePosition): number => pageIndex + progress;

const sanitizeLockstepMarkers = (
    value: unknown,
    leftPageCount: number,
    rightPageCount: number,
): ParallelLockstepMarkers | undefined => {
    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const markers = value as Partial<ParallelLockstepMarkers>;
    if (!markers.start || !markers.end) {
        return undefined;
    }

    const start = {
        left: sanitizePosition(markers.start.left, leftPageCount),
        right: sanitizePosition(markers.start.right, rightPageCount),
    };
    const end = {
        left: sanitizePosition(markers.end.left, leftPageCount),
        right: sanitizePosition(markers.end.right, rightPageCount),
    };

    if (
        getPositionCoordinate(end.left) <= getPositionCoordinate(start.left) ||
        getPositionCoordinate(end.right) <= getPositionCoordinate(start.right)
    ) {
        return undefined;
    }

    return { end, start };
};

const sanitizePaneSettings = (value: unknown): ParallelReaderPaneSettings => {
    if (!value || typeof value !== 'object') {
        return createDefaultPaneSettings();
    }

    const settings = value as Partial<ParallelReaderPaneSettings>;
    const { autoScroll } = settings;

    return {
        autoScroll: {
            smooth: typeof autoScroll?.smooth === 'boolean' ? autoScroll.smooth : true,
            value:
                typeof autoScroll?.value === 'number' && Number.isFinite(autoScroll.value)
                    ? coerceIn(autoScroll.value, AUTO_SCROLL_SPEED.min, AUTO_SCROLL_SPEED.max)
                    : AUTO_SCROLL_SPEED.default,
        },
        pageGap:
            typeof settings.pageGap === 'number' && Number.isFinite(settings.pageGap)
                ? coerceIn(settings.pageGap, PAGE_GAP.min, PAGE_GAP.max)
                : PAGE_GAP.default,
        pageScaleMode:
            settings.pageScaleMode !== undefined && Object.values(ReaderPageScaleMode).includes(settings.pageScaleMode)
                ? settings.pageScaleMode!
                : ReaderPageScaleMode.WIDTH,
        readingDirection:
            settings.readingDirection !== undefined &&
            Object.values(ReadingDirection).includes(settings.readingDirection)
                ? settings.readingDirection!
                : ReadingDirection.LTR,
        readingMode: settings.readingMode === 'single' ? 'single' : 'continuous',
        shouldStretchPage: typeof settings.shouldStretchPage === 'boolean' ? settings.shouldStretchPage : false,
    };
};

export const sanitizeParallelReaderAlignment = (
    value: unknown,
    leftPageCount: number,
    rightPageCount: number,
): ParallelReaderAlignmentState => {
    if (!value || typeof value !== 'object') {
        return DEFAULT_PARALLEL_READER_ALIGNMENT;
    }

    const state = value as Partial<ParallelReaderAlignmentState>;
    const anchors = Array.isArray(state.anchors) ? state.anchors : [];
    const validAnchors = validatePageAnchors(anchors, leftPageCount, rightPageCount).length ? [] : anchors;
    const lockstepMarkers = sanitizeLockstepMarkers(state.lockstepMarkers, leftPageCount, rightPageCount);

    return {
        anchors: validAnchors,
        isSyncEnabled: typeof state.isSyncEnabled === 'boolean' ? state.isSyncEnabled : true,
        leftReaderSettings: sanitizePaneSettings(state.leftReaderSettings),
        leftPosition: sanitizePosition(state.leftPosition, leftPageCount),
        leftWidth: coerceIn(typeof state.leftWidth === 'number' ? state.leftWidth : 50, 25, 75),
        lockstepCalibrated:
            typeof state.lockstepCalibrated === 'boolean' && state.lockstepCalibrated && Boolean(lockstepMarkers),
        lockstepMarkers,
        percentageOffset:
            typeof state.percentageOffset === 'number' && Number.isFinite(state.percentageOffset)
                ? coerceIn(state.percentageOffset, -1, 1)
                : 0,
        rightReaderSettings: sanitizePaneSettings(state.rightReaderSettings),
        rightPosition: sanitizePosition(state.rightPosition, rightPageCount),
        syncMode: ['page', 'percentage', 'lockstep'].includes(state.syncMode ?? '') ? state.syncMode! : 'page',
        version: 4,
    };
};
