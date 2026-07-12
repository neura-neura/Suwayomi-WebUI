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
import { scrollToPagePosition } from '@/features/parallel-reader/utils/PageVisibility.ts';
import { mapPagePosition } from '@/features/parallel-reader/utils/PageMapping.ts';
import {
    getLockstepTargetTop,
    getPercentageTargetTop,
    getScrollableHeight,
} from '@/features/parallel-reader/utils/ScrollSync.ts';

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
    const lockstepOriginRef = useRef<{ leftTop: number; rightTop: number } | undefined>(undefined);
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

    const calibrateLockstep = useCallback(() => {
        if (!leftRef.current || !rightRef.current) {
            return false;
        }

        cancelAnimationFrame(animationFrameRef.current ?? 0);
        pendingProgrammaticTopRef.current = {};
        lockstepOriginRef.current = {
            leftTop: leftRef.current.scrollTop,
            rightTop: rightRef.current.scrollTop,
        };
        onLockstepCalibrated(true);
        return true;
    }, [leftRef, onLockstepCalibrated, rightRef]);

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
                            scrollToPagePosition(
                                target,
                                targetPages,
                                mapPagePosition(
                                    sourcePosition,
                                    anchors,
                                    sourceSide === 'left' ? 'left-to-right' : 'right-to-left',
                                    targetPages.length,
                                ),
                            );
                            pendingProgrammaticTopRef.current[targetSide] = target.scrollTop;
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
                        if (!lockstepCalibrated || !origin) {
                            break;
                        }

                        const unclampedTop =
                            sourceSide === 'left'
                                ? origin.rightTop + (source.scrollTop - origin.leftTop)
                                : origin.leftTop + (source.scrollTop - origin.rightTop);
                        const desiredTop = getLockstepTargetTop(
                            source.scrollTop,
                            getScrollableHeight(target),
                            origin,
                            sourceSide,
                        );
                        writeTargetTop(target, targetSide, desiredTop);
                        if (
                            Math.abs(unclampedTop - desiredTop) > 0.5 ||
                            Math.abs(target.scrollTop - desiredTop) > 0.5
                        ) {
                            lockstepOriginRef.current = {
                                leftTop: leftRef.current?.scrollTop ?? 0,
                                rightTop: rightRef.current?.scrollTop ?? 0,
                            };
                        }
                        break;
                    }
                    default: {
                        const unsupportedMode: never = mode;
                        throw new Error(`Unsupported parallel scroll mode: ${unsupportedMode}`);
                    }
                }
            });
        },
        [anchors, getElements, leftRef, lockstepCalibrated, mode, percentageOffset, rightRef, writeTargetTop],
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
