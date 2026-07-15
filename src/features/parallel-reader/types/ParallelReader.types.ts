/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ReaderPageScaleMode, ReadingDirection } from '@/features/reader/Reader.types.ts';

export type ParallelReaderSourceSelection = {
    id: string;
    displayName: string;
};

export type ParallelReaderMangaSelection = {
    id: number;
    sourceId: string;
    title: string;
};

export type ParallelReaderChapterSelection = {
    id: number;
    name: string;
    pageCount: number;
    sourceOrder: number;
};

export type ParallelReaderSideSelection = {
    source?: ParallelReaderSourceSelection;
    manga?: ParallelReaderMangaSelection;
    chapter?: ParallelReaderChapterSelection;
};

export type ParallelPagePosition = {
    pageIndex: number;
    progress: number;
};

export type ParallelReaderSide = 'left' | 'right';

export type ParallelLockstepMarkers = {
    end: Record<ParallelReaderSide, ParallelPagePosition>;
    start: Record<ParallelReaderSide, ParallelPagePosition>;
};

export type PageAnchor = {
    leftPage: number;
    rightPage: number;
};

export type ParallelScrollSyncMode = 'page' | 'percentage' | 'lockstep';
export type ParallelReaderReadingMode = 'continuous' | 'single';

export type ParallelReaderPaneSettings = {
    autoScroll: {
        smooth: boolean;
        value: number;
    };
    pageGap: number;
    pageScaleMode: ReaderPageScaleMode;
    readingDirection: ReadingDirection;
    readingMode: ParallelReaderReadingMode;
    shouldStretchPage: boolean;
};

export type ParallelReaderAlignmentState = {
    anchors: PageAnchor[];
    isSyncEnabled: boolean;
    leftReaderSettings: ParallelReaderPaneSettings;
    leftPosition: ParallelPagePosition;
    leftWidth: number;
    lockstepCalibrated: boolean;
    lockstepMarkers?: ParallelLockstepMarkers;
    percentageOffset: number;
    rightReaderSettings: ParallelReaderPaneSettings;
    rightPosition: ParallelPagePosition;
    syncMode: ParallelScrollSyncMode;
    version: 4;
};
