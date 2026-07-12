/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export type ParallelReaderSide = 'left' | 'right';

const getScrollProgress = (element: HTMLElement): number => {
    const scrollableHeight = element.scrollHeight - element.clientHeight;
    return scrollableHeight > 0 ? element.scrollTop / scrollableHeight : 0;
};

export const useParallelScrollSync = (
    leftRef: RefObject<HTMLElement | null>,
    rightRef: RefObject<HTMLElement | null>,
    enabled: boolean,
) => {
    const animationFrameRef = useRef<number | undefined>(undefined);
    const releaseFrameRef = useRef<number | undefined>(undefined);
    const programmaticTargetRef = useRef<ParallelReaderSide | undefined>(undefined);
    const lastUserSideRef = useRef<ParallelReaderSide>('left');

    const getElements = useCallback(
        (sourceSide: ParallelReaderSide) => ({
            source: sourceSide === 'left' ? leftRef.current : rightRef.current,
            target: sourceSide === 'left' ? rightRef.current : leftRef.current,
            targetSide: sourceSide === 'left' ? ('right' as const) : ('left' as const),
        }),
        [leftRef, rightRef],
    );

    const synchronizeFrom = useCallback(
        (sourceSide: ParallelReaderSide) => {
            const { source, target, targetSide } = getElements(sourceSide);
            if (!source || !target) {
                return;
            }

            cancelAnimationFrame(animationFrameRef.current ?? 0);
            animationFrameRef.current = requestAnimationFrame(() => {
                const progress = getScrollProgress(source);
                const targetScrollableHeight = target.scrollHeight - target.clientHeight;

                programmaticTargetRef.current = targetSide;
                target.scrollTop = progress * Math.max(0, targetScrollableHeight);

                cancelAnimationFrame(releaseFrameRef.current ?? 0);
                releaseFrameRef.current = requestAnimationFrame(() => {
                    programmaticTargetRef.current = undefined;
                });
            });
        },
        [getElements],
    );

    const handleScroll = useCallback(
        (sourceSide: ParallelReaderSide) => {
            if (programmaticTargetRef.current === sourceSide) {
                return;
            }

            lastUserSideRef.current = sourceSide;
            if (enabled) {
                synchronizeFrom(sourceSide);
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
        onLeftScroll: () => handleScroll('left'),
        onRightScroll: () => handleScroll('right'),
        recenter: () => synchronizeFrom(lastUserSideRef.current),
    };
};
