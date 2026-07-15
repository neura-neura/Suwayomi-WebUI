/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ParallelReaderSide } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { coerceIn } from '@/lib/HelperFunctions.ts';

export const getScrollableHeight = (element: HTMLElement): number =>
    Math.max(0, element.scrollHeight - element.clientHeight);

export const getScrollProgress = (scrollTop: number, scrollableHeight: number): number =>
    scrollableHeight > 0 ? coerceIn(scrollTop / scrollableHeight, 0, 1) : 0;

export const getPercentageTargetTop = (
    sourceTop: number,
    sourceScrollableHeight: number,
    targetScrollableHeight: number,
    percentageOffset: number,
    sourceSide: ParallelReaderSide,
): number => {
    const sourceProgress = getScrollProgress(sourceTop, sourceScrollableHeight);
    const targetProgress = sourceProgress + (sourceSide === 'left' ? percentageOffset : -percentageOffset);
    return coerceIn(targetProgress, 0, 1) * targetScrollableHeight;
};

/**
 * Maps a scroll position from one chapter to another after the readers have
 * been aligned at an equivalent point. The space before and after that point
 * is scaled independently, so both readers retain the alignment and reach
 * the beginning/end together even when their images have different rendered
 * heights or the chapters contain a different number of pages.
 */
export const getContentMovementTargetTop = (
    sourceTop: number,
    sourceScrollableHeight: number,
    sourceOriginTop: number,
    targetScrollableHeight: number,
    targetOriginTop: number,
): number => {
    const boundedSourceScrollableHeight = Math.max(0, sourceScrollableHeight);
    const boundedTargetScrollableHeight = Math.max(0, targetScrollableHeight);
    const boundedSourceTop = coerceIn(sourceTop, 0, boundedSourceScrollableHeight);
    const boundedSourceOrigin = coerceIn(sourceOriginTop, 0, boundedSourceScrollableHeight);
    const boundedTargetOrigin = coerceIn(targetOriginTop, 0, boundedTargetScrollableHeight);

    if (boundedSourceTop === boundedSourceOrigin) {
        return boundedTargetOrigin;
    }

    if (boundedSourceTop >= boundedSourceOrigin) {
        const sourceDistanceToEnd = boundedSourceScrollableHeight - boundedSourceOrigin;
        const targetDistanceToEnd = boundedTargetScrollableHeight - boundedTargetOrigin;

        if (sourceDistanceToEnd === 0) {
            return boundedTargetScrollableHeight;
        }

        return coerceIn(
            boundedTargetOrigin +
                ((boundedSourceTop - boundedSourceOrigin) / sourceDistanceToEnd) * targetDistanceToEnd,
            0,
            boundedTargetScrollableHeight,
        );
    }

    if (boundedSourceOrigin === 0) {
        return 0;
    }

    return coerceIn(
        boundedTargetOrigin - ((boundedSourceOrigin - boundedSourceTop) / boundedSourceOrigin) * boundedTargetOrigin,
        0,
        boundedTargetScrollableHeight,
    );
};
