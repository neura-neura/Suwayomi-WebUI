/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ParallelPagePosition } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { scrollToPagePosition } from '@/features/parallel-reader/utils/PageVisibility.ts';
import { coerceIn } from '@/lib/HelperFunctions.ts';

export type ParallelReaderSide = 'left' | 'right';
export type ParallelScrollSyncMode = 'page' | 'percentage';

const getScrollProgress = (element: HTMLElement): number => {
    const scrollableHeight = element.scrollHeight - element.clientHeight;
    return scrollableHeight > 0 ? element.scrollTop / scrollableHeight : 0;
};

export const useParallelScrollSync = (
    leftRef: RefObject<HTMLElement | null>,
    rightRef: RefObject<HTMLElement | null>,
    leftPageElementsRef: RefObject<(HTMLElement | null)[]>,
    rightPageElementsRef: RefObject<(HTMLElement | null)[]>,
    enabled: boolean,
    mode: ParallelScrollSyncMode,
) => {
    const animationFrameRef = useRef<number | undefined>(undefined);
    const releaseFrameRef = useRef<number | undefined>(undefined);
    const programmaticTargetRef = useRef<ParallelReaderSide | undefined>(undefined);
    const lastUserSideRef = useRef<ParallelReaderSide>('left');
    const positionsRef = useRef<Record<ParallelReaderSide, ParallelPagePosition | undefined>>({
        left: undefined,
        right: undefined,
    });

    const getElements = useCallback(
        (sourceSide: ParallelReaderSide) => ({
            source: sourceSide === 'left' ? leftRef.current : rightRef.current,
            target: sourceSide === 'left' ? rightRef.current : leftRef.current,
            targetPages: sourceSide === 'left' ? rightPageElementsRef.current : leftPageElementsRef.current,
            targetSide: sourceSide === 'left' ? ('right' as const) : ('left' as const),
        }),
        [leftPageElementsRef, leftRef, rightPageElementsRef, rightRef],
    );

    const synchronizeFrom = useCallback(
        (sourceSide: ParallelReaderSide, sourcePosition = positionsRef.current[sourceSide]) => {
            const { source, target, targetPages, targetSide } = getElements(sourceSide);
            if (!source || !target) {
                return;
            }

            cancelAnimationFrame(animationFrameRef.current ?? 0);
            animationFrameRef.current = requestAnimationFrame(() => {
                programmaticTargetRef.current = targetSide;
                if (mode === 'page' && sourcePosition && targetPages.length) {
                    scrollToPagePosition(target, targetPages, {
                        pageIndex: coerceIn(sourcePosition.pageIndex, 0, targetPages.length - 1),
                        progress: sourcePosition.progress,
                    });
                } else {
                    const progress = getScrollProgress(source);
                    const targetScrollableHeight = target.scrollHeight - target.clientHeight;
                    target.scrollTo({ top: progress * Math.max(0, targetScrollableHeight) });
                }

                cancelAnimationFrame(releaseFrameRef.current ?? 0);
                releaseFrameRef.current = requestAnimationFrame(() => {
                    programmaticTargetRef.current = undefined;
                });
            });
        },
        [getElements, mode],
    );

    const handleScroll = useCallback(
        (sourceSide: ParallelReaderSide, position?: ParallelPagePosition) => {
            if (programmaticTargetRef.current === sourceSide) {
                return;
            }

            lastUserSideRef.current = sourceSide;
            positionsRef.current[sourceSide] = position;
            if (enabled) {
                synchronizeFrom(sourceSide, position);
            }
        },
        [enabled, synchronizeFrom],
    );

    useEffect(
        () => () => {
            cancelAnimationFrame(animationFrameRef.current ?? 0);
            cancelAnimationFrame(releaseFrameRef.current ?? 0);
        },
        [],
    );

    return {
        onLeftScroll: (position?: ParallelPagePosition) => handleScroll('left', position),
        onRightScroll: (position?: ParallelPagePosition) => handleScroll('right', position),
        recenter: () => synchronizeFrom(lastUserSideRef.current),
    };
};
