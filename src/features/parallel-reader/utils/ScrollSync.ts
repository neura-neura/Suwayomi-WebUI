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
