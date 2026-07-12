/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type {
    ParallelPagePosition,
    ParallelReaderAlignmentState,
    ParallelReaderSideSelection,
} from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { validatePageAnchors } from '@/features/parallel-reader/utils/PageMapping.ts';
import { coerceIn } from '@/lib/HelperFunctions.ts';

export const PARALLEL_READER_LEFT_SELECTION_KEY = 'parallel-reader:left-selection:v1';
export const PARALLEL_READER_RIGHT_SELECTION_KEY = 'parallel-reader:right-selection:v1';
export const PARALLEL_READER_OPEN_KEY = 'parallel-reader:open:v1';

export const DEFAULT_PARALLEL_READER_ALIGNMENT: ParallelReaderAlignmentState = {
    anchors: [],
    isSyncEnabled: true,
    leftPosition: { pageIndex: 0, progress: 0 },
    leftWidth: 50,
    rightPosition: { pageIndex: 0, progress: 0 },
    syncMode: 'page',
    version: 1,
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

    return {
        anchors: validAnchors,
        isSyncEnabled: typeof state.isSyncEnabled === 'boolean' ? state.isSyncEnabled : true,
        leftPosition: sanitizePosition(state.leftPosition, leftPageCount),
        leftWidth: coerceIn(typeof state.leftWidth === 'number' ? state.leftWidth : 50, 25, 75),
        rightPosition: sanitizePosition(state.rightPosition, rightPageCount),
        syncMode: ['page', 'percentage'].includes(state.syncMode ?? '') ? state.syncMode! : 'page',
        version: 1,
    };
};
