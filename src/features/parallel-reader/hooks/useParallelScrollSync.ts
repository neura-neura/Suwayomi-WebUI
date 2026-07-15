/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type {
    PageAnchor,
    ParallelPagePosition,
    ParallelReaderSide,
    ParallelScrollSyncMode,
} from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { getVisiblePagePosition, scrollToPagePosition } from '@/features/parallel-reader/utils/PageVisibility.ts';
import { mapContentRelativePosition, mapPagePosition } from '@/features/parallel-reader/utils/PageMapping.ts';
import { getPercentageTargetTop, getScrollableHeight } from '@/features/parallel-reader/utils/ScrollSync.ts';

export const useParallelScrollSync = (
    leftRef: RefObject<HTMLElement | null>,
    rightRef: RefObject<HTMLElement | null>,
    leftPageElementsRef: RefObject<(HTMLElement | null)[]>,
    rightPageElementsRef: RefObject<(HTMLElement | null)[]>,
    anchors: PageAnchor[],
    enabled: boolean,
    mode: ParallelScrollSyncMode,
    percentageOffset: number,
    lockstepCalibrated: boolean,
    onLockstepCalibrated: (calibrated: boolean) => void,
    calibrationKey: string,
) => {
    const animationFrameRef = useRef<number | undefined>(undefined);
    const pendingProgrammaticTopRef = useRef<Partial<Record<ParallelReaderSide, number>>>({});
    const lockstepOriginRef = useRef<Record<ParallelReaderSide, ParallelPagePosition> | undefined>(undefined);
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

    const calibrateLockstep = useCallback(
        (providedPositions?: Partial<Record<ParallelReaderSide, ParallelPagePosition>>) => {
            if (!leftRef.current || !rightRef.current) {
                return false;
            }

            const leftPosition =
                providedPositions?.left ??
                positionsRef.current.left ??
                getVisiblePagePosition(leftRef.current, leftPageElementsRef.current);
            const rightPosition =
                providedPositions?.right ??
                positionsRef.current.right ??
                getVisiblePagePosition(rightRef.current, rightPageElementsRef.current);
            if (!leftPosition || !rightPosition) {
                return false;
            }

            cancelAnimationFrame(animationFrameRef.current ?? 0);
            pendingProgrammaticTopRef.current = {};
            positionsRef.current = { left: leftPosition, right: rightPosition };
            lockstepOriginRef.current = {
                left: leftPosition,
                right: rightPosition,
            };
            onLockstepCalibrated(true);
            return true;
        },
        [leftPageElementsRef, leftRef, onLockstepCalibrated, rightPageElementsRef, rightRef],
    );

    const scrollTargetToPagePosition = useCallback(
        (
            target: HTMLElement,
            targetSide: ParallelReaderSide,
            targetPages: (HTMLElement | null)[],
            position: ParallelPagePosition,
        ) => {
            scrollToPagePosition(target, targetPages, position);
            pendingProgrammaticTopRef.current[targetSide] = target.scrollTop;
        },
        [],
    );

    const writeTargetTop = useCallback((target: HTMLElement, targetSide: ParallelReaderSide, top: number) => {
        target.scrollTo({ top });
        pendingProgrammaticTopRef.current[targetSide] = target.scrollTop;
    }, []);

    const synchronizeFrom = useCallback(
        (sourceSide: ParallelReaderSide, sourcePosition = positionsRef.current[sourceSide]) => {
            const { source, target, targetPages, targetSide } = getElements(sourceSide);
            if (!source || !target) {
                return;
            }

            cancelAnimationFrame(animationFrameRef.current ?? 0);
            animationFrameRef.current = requestAnimationFrame(() => {
                switch (mode) {
                    case 'page':
                        if (sourcePosition && targetPages.length) {
                            scrollTargetToPagePosition(
                                target,
                                targetSide,
                                targetPages,
                                mapPagePosition(
                                    sourcePosition,
                                    anchors,
                                    sourceSide === 'left' ? 'left-to-right' : 'right-to-left',
                                    targetPages.length,
                                ),
                            );
                        }
                        break;
                    case 'percentage':
                        writeTargetTop(
                            target,
                            targetSide,
                            getPercentageTargetTop(
                                source.scrollTop,
                                getScrollableHeight(source),
                                getScrollableHeight(target),
                                percentageOffset,
                                sourceSide,
                            ),
                        );
                        break;
                    case 'lockstep': {
                        const origin = lockstepOriginRef.current;
                        if (!lockstepCalibrated || !origin || !sourcePosition || !targetPages.length) {
                            break;
                        }

                        scrollTargetToPagePosition(
                            target,
                            targetSide,
                            targetPages,
                            mapContentRelativePosition(
                                sourcePosition,
                                origin[sourceSide],
                                origin[targetSide],
                                anchors,
                                sourceSide === 'left' ? 'left-to-right' : 'right-to-left',
                                targetPages.length,
                            ),
                        );
                        break;
                    }
                    default: {
                        const unsupportedMode: never = mode;
                        throw new Error(`Unsupported parallel scroll mode: ${unsupportedMode}`);
                    }
                }
            });
        },
        [anchors, getElements, lockstepCalibrated, mode, percentageOffset, scrollTargetToPagePosition, writeTargetTop],
    );

    const handleScroll = useCallback(
        (sourceSide: ParallelReaderSide, position?: ParallelPagePosition) => {
            const element = sourceSide === 'left' ? leftRef.current : rightRef.current;
            const pendingTop = pendingProgrammaticTopRef.current[sourceSide];
            if (pendingTop !== undefined && element && Math.abs(element.scrollTop - pendingTop) <= 0.5) {
                delete pendingProgrammaticTopRef.current[sourceSide];
                positionsRef.current[sourceSide] = position;
                return;
            }

            delete pendingProgrammaticTopRef.current[sourceSide];
            positionsRef.current[sourceSide] = position;
            if (enabled) {
                synchronizeFrom(sourceSide, position);
            }
        },
        [enabled, leftRef, rightRef, synchronizeFrom],
    );

    useEffect(() => {
        if (!lockstepCalibrated) {
            lockstepOriginRef.current = undefined;
        }
    }, [lockstepCalibrated]);

    useEffect(() => {
        lockstepOriginRef.current = undefined;
        pendingProgrammaticTopRef.current = {};
    }, [calibrationKey]);

    useEffect(
        () => () => {
            cancelAnimationFrame(animationFrameRef.current ?? 0);
        },
        [],
    );

    return {
        onLeftScroll: (position?: ParallelPagePosition) => handleScroll('left', position),
        onRightScroll: (position?: ParallelPagePosition) => handleScroll('right', position),
        alignFromLeft: (position?: ParallelPagePosition) => synchronizeFrom('left', position),
        alignFromRight: (position?: ParallelPagePosition) => synchronizeFrom('right', position),
        calibrateLockstep,
    };
};
