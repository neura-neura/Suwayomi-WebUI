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

const interpolateScrollTop = (
    sourceTop: number,
    sourceStart: number,
    sourceEnd: number,
    targetStart: number,
    targetEnd: number,
): number => {
    if (sourceEnd === sourceStart) {
        return targetEnd;
    }

    return targetStart + ((sourceTop - sourceStart) / (sourceEnd - sourceStart)) * (targetEnd - targetStart);
};

/**
 * Maps one reader's actual rendered scroll distance to the other reader using
 * two matching content scenes. Re-evaluating this on every scroll means image
 * loads and unequal page dimensions do not turn page indices into the source
 * of truth.
 */
export const getContentMarkerTargetTop = (
    sourceTop: number,
    sourceScrollableHeight: number,
    sourceStartTop: number,
    sourceEndTop: number,
    targetScrollableHeight: number,
    targetStartTop: number,
    targetEndTop: number,
): number => {
    const sourceMaximum = Math.max(0, sourceScrollableHeight);
    const targetMaximum = Math.max(0, targetScrollableHeight);
    const boundedSourceTop = coerceIn(sourceTop, 0, sourceMaximum);
    const boundedSourceStart = coerceIn(sourceStartTop, 0, sourceMaximum);
    const boundedSourceEnd = coerceIn(sourceEndTop, boundedSourceStart, sourceMaximum);
    const boundedTargetStart = coerceIn(targetStartTop, 0, targetMaximum);
    const boundedTargetEnd = coerceIn(targetEndTop, boundedTargetStart, targetMaximum);
    let targetTop: number;

    if (boundedSourceTop <= boundedSourceStart) {
        targetTop = interpolateScrollTop(boundedSourceTop, 0, boundedSourceStart, 0, boundedTargetStart);
    } else if (boundedSourceTop <= boundedSourceEnd) {
        targetTop = interpolateScrollTop(
            boundedSourceTop,
            boundedSourceStart,
            boundedSourceEnd,
            boundedTargetStart,
            boundedTargetEnd,
        );
    } else {
        targetTop = interpolateScrollTop(
            boundedSourceTop,
            boundedSourceEnd,
            sourceMaximum,
            boundedTargetEnd,
            targetMaximum,
        );
    }

    return coerceIn(targetTop, 0, targetMaximum);
};
