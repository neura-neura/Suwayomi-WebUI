/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import VerticalSplitIcon from '@mui/icons-material/VerticalSplit';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { useLingui } from '@lingui/react/macro';
import type {
    PageAnchor,
    ParallelLockstepMarkerName,
    ParallelLockstepMarkers,
    ParallelPagePosition,
    ParallelReaderPaneSettings,
    ParallelReaderSide,
    ParallelReaderSideSelection,
    ParallelScrollSyncMode,
} from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { ParallelReaderPane } from '@/features/parallel-reader/components/ParallelReaderPane.tsx';
import { coerceIn } from '@/lib/HelperFunctions.ts';
import { useParallelScrollSync } from '@/features/parallel-reader/hooks/useParallelScrollSync.ts';
import { PageAnchorEditor } from '@/features/parallel-reader/components/PageAnchorEditor.tsx';
import { scrollToPagePosition } from '@/features/parallel-reader/utils/PageVisibility.ts';
import { upsertPageAnchor, validatePageAnchors } from '@/features/parallel-reader/utils/PageMapping.ts';
import { getScrollableHeight, getScrollProgress } from '@/features/parallel-reader/utils/ScrollSync.ts';
import { useLocalStorage } from '@/base/hooks/useStorage.tsx';
import { AppStorage } from '@/lib/storage/AppStorage.ts';
import {
    DEFAULT_PARALLEL_READER_ALIGNMENT,
    getParallelReaderAlignmentKey,
    sanitizeParallelReaderAlignment,
} from '@/features/parallel-reader/services/ParallelReaderPersistence.ts';

type ParallelReaderWorkspaceProps = {
    leftSelection: Required<ParallelReaderSideSelection>;
    rightSelection: Required<ParallelReaderSideSelection>;
    onClose: () => void;
    onSwap: () => void;
};

type LockstepMarkerStage = 'start' | 'end';

const getMarkerCoordinate = ({ pageIndex, progress }: ParallelPagePosition): number => pageIndex + progress;

const getPositionFromMarkerCoordinate = (coordinate: number, pageCount: number): ParallelPagePosition => {
    const boundedCoordinate = coerceIn(coordinate, 0, pageCount);
    if (boundedCoordinate === pageCount) {
        return { pageIndex: pageCount - 1, progress: 1 };
    }

    const pageIndex = Math.floor(boundedCoordinate);
    return { pageIndex, progress: boundedCoordinate - pageIndex };
};

export const ParallelReaderWorkspace = ({
    leftSelection,
    rightSelection,
    onClose,
    onSwap,
}: ParallelReaderWorkspaceProps) => {
    const { t } = useLingui();
    const workspaceRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const leftScrollRef = useRef<HTMLDivElement | null>(null);
    const rightScrollRef = useRef<HTMLDivElement | null>(null);
    const leftPageElementsRef = useRef<(HTMLElement | null)[]>([]);
    const rightPageElementsRef = useRef<(HTMLElement | null)[]>([]);
    const syncBeforeAdjustmentRef = useRef(true);
    const lockstepCalibratedBeforeAdjustmentRef = useRef(false);
    const lockstepMarkersBeforeAdjustmentRef = useRef<ParallelLockstepMarkers | undefined>(undefined);
    const wasResizingRef = useRef(false);
    const controlsHideTimeoutRef = useRef<number | undefined>(undefined);
    const alignmentKey = getParallelReaderAlignmentKey(leftSelection, rightSelection);
    const [persistedAlignment, setPersistedAlignment] = useLocalStorage<unknown>(
        alignmentKey,
        DEFAULT_PARALLEL_READER_ALIGNMENT,
    );
    const initialAlignmentRef = useRef(
        sanitizeParallelReaderAlignment(
            persistedAlignment,
            leftSelection.chapter.pageCount,
            rightSelection.chapter.pageCount,
        ),
    );
    const loadedAlignmentKeyRef = useRef(alignmentKey);
    const [leftWidth, setLeftWidth] = useState(initialAlignmentRef.current.leftWidth);
    const [isResizing, setIsResizing] = useState(false);
    const [isSyncEnabled, setIsSyncEnabled] = useState(
        initialAlignmentRef.current.syncMode === 'lockstep' && !initialAlignmentRef.current.lockstepCalibrated
            ? false
            : initialAlignmentRef.current.isSyncEnabled,
    );
    const [syncMode, setSyncMode] = useState<ParallelScrollSyncMode>(initialAlignmentRef.current.syncMode);
    const [anchors, setAnchors] = useState<PageAnchor[]>(initialAlignmentRef.current.anchors);
    const [leftReaderSettings, setLeftReaderSettings] = useState<ParallelReaderPaneSettings>(
        initialAlignmentRef.current.leftReaderSettings,
    );
    const [percentageOffset, setPercentageOffset] = useState(initialAlignmentRef.current.percentageOffset);
    const [lockstepCalibrated, setLockstepCalibrated] = useState(initialAlignmentRef.current.lockstepCalibrated);
    const [lockstepMarkers, setLockstepMarkers] = useState<ParallelLockstepMarkers | undefined>(
        initialAlignmentRef.current.lockstepMarkers,
    );
    const [rightReaderSettings, setRightReaderSettings] = useState<ParallelReaderPaneSettings>(
        initialAlignmentRef.current.rightReaderSettings,
    );
    const [activeAutoScrollSide, setActiveAutoScrollSide] = useState<ParallelReaderSide>();
    const [isAdjustingAlignment, setIsAdjustingAlignment] = useState(
        initialAlignmentRef.current.syncMode === 'lockstep' && !initialAlignmentRef.current.lockstepCalibrated,
    );
    const [lockstepMarkerStage, setLockstepMarkerStage] = useState<LockstepMarkerStage>('start');
    const [alignmentError, setAlignmentError] = useState(false);
    const [restoredSides, setRestoredSides] = useState(0);
    const [leftPosition, setLeftPosition] = useState<ParallelPagePosition>(initialAlignmentRef.current.leftPosition);
    const [rightPosition, setRightPosition] = useState<ParallelPagePosition>(initialAlignmentRef.current.rightPosition);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [areFullscreenControlsVisible, setAreFullscreenControlsVisible] = useState(true);
    const [areFullscreenControlsPinned, setAreFullscreenControlsPinned] = useState(false);
    const handleLockstepCalibrated = useCallback((calibrated: boolean) => setLockstepCalibrated(calibrated), []);
    const { onLeftScroll, onRightScroll, alignFromLeft, alignFromRight, calibrateLockstep } = useParallelScrollSync(
        leftScrollRef,
        rightScrollRef,
        leftPageElementsRef,
        rightPageElementsRef,
        anchors,
        isSyncEnabled,
        syncMode,
        percentageOffset,
        lockstepCalibrated,
        lockstepMarkers,
        handleLockstepCalibrated,
        alignmentKey,
    );

    const resize = useCallback((clientX: number) => {
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) {
            return;
        }

        setLeftWidth(coerceIn(((clientX - bounds.left) / bounds.width) * 100, 25, 75));
    }, []);

    useEffect(() => {
        if (loadedAlignmentKeyRef.current === alignmentKey) {
            return;
        }

        loadedAlignmentKeyRef.current = alignmentKey;
        setRestoredSides(0);
        const alignment = sanitizeParallelReaderAlignment(
            persistedAlignment,
            leftSelection.chapter.pageCount,
            rightSelection.chapter.pageCount,
        );
        setAnchors(alignment.anchors);
        setIsSyncEnabled(
            alignment.syncMode === 'lockstep' && !alignment.lockstepCalibrated ? false : alignment.isSyncEnabled,
        );
        setIsAdjustingAlignment(alignment.syncMode === 'lockstep' && !alignment.lockstepCalibrated);
        setActiveAutoScrollSide(undefined);
        setLeftReaderSettings(alignment.leftReaderSettings);
        setLeftPosition(alignment.leftPosition);
        setLeftWidth(alignment.leftWidth);
        setLockstepCalibrated(alignment.lockstepCalibrated);
        setLockstepMarkers(alignment.lockstepMarkers);
        setLockstepMarkerStage('start');
        setPercentageOffset(alignment.percentageOffset);
        setRightReaderSettings(alignment.rightReaderSettings);
        setRightPosition(alignment.rightPosition);
        setSyncMode(alignment.syncMode);
    }, [alignmentKey, persistedAlignment, leftSelection.chapter.pageCount, rightSelection.chapter.pageCount]);

    useEffect(() => {
        if (restoredSides === 3 && syncMode === 'lockstep' && lockstepCalibrated && lockstepMarkers) {
            calibrateLockstep(lockstepMarkers);
        }
    }, [calibrateLockstep, lockstepCalibrated, lockstepMarkers, restoredSides, syncMode]);

    useEffect(() => {
        if (wasResizingRef.current && !isResizing && syncMode === 'lockstep' && lockstepCalibrated && lockstepMarkers) {
            calibrateLockstep(lockstepMarkers);
        }
        wasResizingRef.current = isResizing;
    }, [calibrateLockstep, isResizing, lockstepCalibrated, lockstepMarkers, syncMode]);

    useEffect(() => {
        if (syncMode === 'lockstep' && isAdjustingAlignment) {
            return () => {};
        }

        const persistTimeout = setTimeout(
            () =>
                setPersistedAlignment({
                    anchors,
                    isSyncEnabled,
                    leftReaderSettings,
                    leftPosition,
                    leftWidth,
                    lockstepCalibrated,
                    lockstepMarkers,
                    percentageOffset,
                    rightReaderSettings,
                    rightPosition,
                    syncMode,
                    version: 4,
                }),
            300,
        );

        return () => clearTimeout(persistTimeout);
    }, [
        alignmentKey,
        anchors,
        isSyncEnabled,
        isAdjustingAlignment,
        leftReaderSettings,
        leftPosition,
        leftWidth,
        lockstepCalibrated,
        lockstepMarkers,
        percentageOffset,
        rightReaderSettings,
        rightPosition,
        syncMode,
    ]);

    useEffect(() => {
        if (syncMode !== 'lockstep' || !lockstepCalibrated || !lockstepMarkers) {
            return () => {};
        }

        const frame = requestAnimationFrame(() => calibrateLockstep(lockstepMarkers));
        return () => cancelAnimationFrame(frame);
    }, [
        calibrateLockstep,
        leftReaderSettings.pageGap,
        leftReaderSettings.pageScaleMode,
        leftReaderSettings.readingMode,
        leftReaderSettings.shouldStretchPage,
        lockstepCalibrated,
        lockstepMarkers,
        rightReaderSettings.pageGap,
        rightReaderSettings.pageScaleMode,
        rightReaderSettings.readingMode,
        rightReaderSettings.shouldStretchPage,
        syncMode,
        isFullscreen,
    ]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const isWorkspaceFullscreen = document.fullscreenElement === workspaceRef.current;
            setIsFullscreen(isWorkspaceFullscreen);
            setAreFullscreenControlsVisible(true);

            if (!isWorkspaceFullscreen) {
                setAreFullscreenControlsPinned(false);
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            window.clearTimeout(controlsHideTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!isResizing) {
            return () => {};
        }

        const handlePointerMove = (event: globalThis.PointerEvent) => resize(event.clientX);
        const stopResizing = () => setIsResizing(false);

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', stopResizing, { once: true });

        return () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', stopResizing);
        };
    }, [isResizing, resize]);

    const handleResizeStart = (event: PointerEvent) => {
        event.preventDefault();
        setIsResizing(true);
        resize(event.clientX);
    };

    const handleResizeKeyDown = (event: KeyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            return;
        }

        event.preventDefault();
        setLeftWidth((width) => coerceIn(width + (event.key === 'ArrowLeft' ? -2 : 2), 25, 75));
    };

    const handleLeftScroll = (position?: ParallelPagePosition) => {
        if (position) {
            setLeftPosition(position);
        }
        onLeftScroll(position);
    };

    const handleRightScroll = (position?: ParallelPagePosition) => {
        if (position) {
            setRightPosition(position);
        }
        onRightScroll(position);
    };

    const handleAutoScrollActiveChange = (side: ParallelReaderSide, isActive: boolean) => {
        setActiveAutoScrollSide((activeSide) => {
            if (isActive) {
                return side;
            }

            return activeSide === side ? undefined : activeSide;
        });
    };

    const handleLockstepMarkerChange = useCallback(
        (side: ParallelReaderSide, marker: ParallelLockstepMarkerName, position: ParallelPagePosition) => {
            const pageCount = side === 'left' ? leftSelection.chapter.pageCount : rightSelection.chapter.pageCount;
            setLockstepMarkers((currentMarkers) => {
                if (!currentMarkers) {
                    return currentMarkers;
                }

                const sideMarkers = { ...currentMarkers.start };
                const endMarkers = { ...currentMarkers.end };
                let nextPosition = position;
                if (marker === 'start') {
                    const endCoordinate = getMarkerCoordinate(endMarkers[side]);
                    if (getMarkerCoordinate(nextPosition) >= endCoordinate) {
                        nextPosition = getPositionFromMarkerCoordinate(
                            endCoordinate - Math.min(0.001, endCoordinate / 2),
                            pageCount,
                        );
                    }
                    sideMarkers[side] = nextPosition;
                } else {
                    const startCoordinate = getMarkerCoordinate(sideMarkers[side]);
                    if (getMarkerCoordinate(nextPosition) <= startCoordinate) {
                        nextPosition = getPositionFromMarkerCoordinate(
                            startCoordinate + Math.min(0.001, (pageCount - startCoordinate) / 2),
                            pageCount,
                        );
                    }
                    endMarkers[side] = nextPosition;
                }

                return { start: sideMarkers, end: endMarkers };
            });
            setAlignmentError(false);
        },
        [leftSelection.chapter.pageCount, rightSelection.chapter.pageCount],
    );

    const startAlignmentAdjustment = () => {
        syncBeforeAdjustmentRef.current = isSyncEnabled;
        setAlignmentError(false);
        setIsAdjustingAlignment(true);
        setIsSyncEnabled(false);
    };

    const startLockstepMarkerSelection = (preservePreviousMarkers = true) => {
        syncBeforeAdjustmentRef.current = isSyncEnabled;
        lockstepMarkersBeforeAdjustmentRef.current = preservePreviousMarkers ? lockstepMarkers : undefined;
        lockstepCalibratedBeforeAdjustmentRef.current = preservePreviousMarkers && lockstepCalibrated;
        setAlignmentError(false);
        setIsAdjustingAlignment(true);
        setIsSyncEnabled(false);
        setLockstepCalibrated(false);
        setLockstepMarkerStage('start');
    };

    const cancelAlignmentAdjustment = () => {
        setAlignmentError(false);
        setIsAdjustingAlignment(false);
        if (syncMode !== 'lockstep') {
            setIsSyncEnabled(syncBeforeAdjustmentRef.current);
            return;
        }

        const previousMarkers = lockstepMarkersBeforeAdjustmentRef.current;
        const shouldRestoreCalibration = lockstepCalibratedBeforeAdjustmentRef.current && Boolean(previousMarkers);
        setLockstepMarkers(previousMarkers);
        setLockstepMarkerStage('start');
        if (shouldRestoreCalibration && previousMarkers) {
            calibrateLockstep(previousMarkers);
        } else {
            setLockstepCalibrated(false);
        }
        setIsSyncEnabled(shouldRestoreCalibration ? syncBeforeAdjustmentRef.current : false);
    };

    const useCurrentPositions = () => {
        if (syncMode === 'page') {
            const nextAnchors = upsertPageAnchor(anchors, {
                leftPage: leftPosition.pageIndex,
                rightPage: rightPosition.pageIndex,
            });
            if (
                validatePageAnchors(nextAnchors, leftSelection.chapter.pageCount, rightSelection.chapter.pageCount)
                    .length
            ) {
                setAlignmentError(true);
                return;
            }
            setAnchors(nextAnchors);
        } else if (syncMode === 'percentage') {
            if (!leftScrollRef.current || !rightScrollRef.current) {
                return;
            }
            setPercentageOffset(
                getScrollProgress(rightScrollRef.current.scrollTop, getScrollableHeight(rightScrollRef.current)) -
                    getScrollProgress(leftScrollRef.current.scrollTop, getScrollableHeight(leftScrollRef.current)),
            );
        } else {
            if (lockstepMarkerStage === 'start') {
                setLockstepMarkers({
                    start: { left: leftPosition, right: rightPosition },
                    end: lockstepMarkers?.end ?? {
                        left: { pageIndex: leftSelection.chapter.pageCount - 1, progress: 1 },
                        right: { pageIndex: rightSelection.chapter.pageCount - 1, progress: 1 },
                    },
                });
                setLockstepMarkerStage('end');
                setAlignmentError(false);
                const leftEndPosition = { pageIndex: leftSelection.chapter.pageCount - 1, progress: 0 };
                const rightEndPosition = { pageIndex: rightSelection.chapter.pageCount - 1, progress: 0 };
                requestAnimationFrame(() => {
                    if (leftScrollRef.current) {
                        scrollToPagePosition(leftScrollRef.current, leftPageElementsRef.current, leftEndPosition);
                    }
                    if (rightScrollRef.current) {
                        scrollToPagePosition(rightScrollRef.current, rightPageElementsRef.current, rightEndPosition);
                    }
                    setLeftPosition(leftEndPosition);
                    setRightPosition(rightEndPosition);
                });
                return;
            }

            if (!lockstepMarkers) {
                return;
            }

            const nextMarkers: ParallelLockstepMarkers = {
                start: lockstepMarkers.start,
                end: { left: leftPosition, right: rightPosition },
            };
            if (!calibrateLockstep(nextMarkers)) {
                setAlignmentError(true);
                return;
            }

            setLockstepMarkers(nextMarkers);
            setLockstepMarkerStage('start');
            setAlignmentError(false);
            setIsAdjustingAlignment(false);
            setIsSyncEnabled(true);
            return;
        }

        setAlignmentError(false);
        setIsAdjustingAlignment(false);
        setIsSyncEnabled(true);
    };

    const handleSyncToggle = (checked: boolean) => {
        if (checked && syncMode === 'lockstep' && !lockstepCalibrated) {
            startLockstepMarkerSelection();
            return;
        }
        setIsSyncEnabled(checked);
    };

    const handleModeChange = (_event: MouseEvent<HTMLElement>, nextMode: ParallelScrollSyncMode | null) => {
        if (!nextMode || nextMode === syncMode) {
            return;
        }

        setSyncMode(nextMode);
        setAlignmentError(false);
        if (nextMode === 'lockstep') {
            setLockstepCalibrated(false);
            setLockstepMarkers(undefined);
            startLockstepMarkerSelection(false);
        } else if (isAdjustingAlignment) {
            setIsAdjustingAlignment(false);
            setIsSyncEnabled(syncBeforeAdjustmentRef.current);
        }
    };

    const goToAnchor = (anchor: PageAnchor) => {
        if (leftScrollRef.current) {
            scrollToPagePosition(leftScrollRef.current, leftPageElementsRef.current, {
                pageIndex: anchor.leftPage,
                progress: 0,
            });
        }
        if (rightScrollRef.current) {
            scrollToPagePosition(rightScrollRef.current, rightPageElementsRef.current, {
                pageIndex: anchor.rightPage,
                progress: 0,
            });
        }
    };

    const setEqualReaderWidths = () => {
        setLeftWidth(50);

        if (syncMode === 'lockstep' && lockstepCalibrated && lockstepMarkers) {
            requestAnimationFrame(() => calibrateLockstep(lockstepMarkers));
        }
    };

    const showFullscreenControls = () => {
        window.clearTimeout(controlsHideTimeoutRef.current);
        setAreFullscreenControlsVisible(true);
    };

    const hideFullscreenControls = () => {
        if (!isFullscreen || areFullscreenControlsPinned) {
            return;
        }

        window.clearTimeout(controlsHideTimeoutRef.current);
        controlsHideTimeoutRef.current = window.setTimeout(() => {
            setAreFullscreenControlsVisible(false);
        }, 650);
    };

    const toggleFullscreen = async () => {
        try {
            if (document.fullscreenElement === workspaceRef.current) {
                await document.exitFullscreen();
                return;
            }

            await workspaceRef.current?.requestFullscreen();
        } catch {
            // The browser can reject fullscreen mode when it is not triggered by a user gesture.
        }
    };

    const toggleFullscreenControlsPinned = () => {
        const nextPinned = !areFullscreenControlsPinned;
        setAreFullscreenControlsPinned(nextPinned);

        if (nextPinned) {
            showFullscreenControls();
        }
    };

    let alignmentActionLabel = t`Use these positions`;
    if (syncMode === 'lockstep') {
        alignmentActionLabel = lockstepMarkerStage === 'start' ? t`Use this start` : t`Use this end`;
    }
    const isSelectingLockstepEnd = syncMode === 'lockstep' && lockstepMarkerStage === 'end';
    const alignmentGuideColor = isSelectingLockstepEnd ? 'success' : 'warning';
    const alignmentGuideLabel = isSelectingLockstepEnd ? t`Align this ending scene` : t`Align this scene`;

    return (
        <Stack
            ref={workspaceRef}
            spacing={isFullscreen ? 0 : 1}
            sx={{
                height: isFullscreen ? '100dvh' : 'calc(100dvh - 80px)',
                minHeight: isFullscreen ? 0 : 480,
                overflow: isFullscreen ? 'hidden' : undefined,
                p: isFullscreen ? 0 : 1,
                position: 'relative',
                bgcolor: isFullscreen ? 'background.default' : undefined,
            }}
        >
            {isFullscreen && !areFullscreenControlsVisible && !areFullscreenControlsPinned && (
                <Box
                    aria-label={t`Show reader controls`}
                    onMouseEnter={showFullscreenControls}
                    sx={{ height: 20, position: 'absolute', top: 0, right: 0, left: 0, zIndex: 3 }}
                />
            )}
            <Box
                onMouseEnter={showFullscreenControls}
                onMouseLeave={hideFullscreenControls}
                sx={{
                    position: isFullscreen ? 'absolute' : 'relative',
                    top: 0,
                    right: 0,
                    left: 0,
                    zIndex: 2,
                    transform: isFullscreen && !areFullscreenControlsVisible ? 'translateY(-100%)' : 'translateY(0)',
                    transition: isFullscreen ? 'transform 200ms ease-out' : undefined,
                    pointerEvents: isFullscreen && !areFullscreenControlsVisible ? 'none' : 'auto',
                }}
            >
                <Stack
                    spacing={1}
                    sx={{
                        maxHeight: isFullscreen ? 'calc(100dvh - 12px)' : undefined,
                        overflowY: isFullscreen ? 'auto' : undefined,
                        bgcolor: isFullscreen ? 'background.default' : undefined,
                        boxShadow: isFullscreen ? 8 : undefined,
                        p: isFullscreen ? 1 : 0,
                    }}
                >
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}
                    >
                        <Button onClick={onClose} startIcon={<ArrowBackIcon />}>
                            {t`Change chapters`}
                        </Button>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Button
                                onClick={toggleFullscreen}
                                startIcon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                            >
                                {isFullscreen ? t`Exit fullscreen` : t`Fullscreen`}
                            </Button>
                            {isFullscreen && (
                                <Button
                                    onClick={toggleFullscreenControlsPinned}
                                    startIcon={areFullscreenControlsPinned ? <PushPinIcon /> : <PushPinOutlinedIcon />}
                                >
                                    {areFullscreenControlsPinned ? t`Unpin controls` : t`Pin controls`}
                                </Button>
                            )}
                            <Chip
                                color={isSyncEnabled ? 'success' : 'default'}
                                label={isSyncEnabled ? t`Scrolling together` : t`Independent scrolling`}
                                size="small"
                                variant="outlined"
                            />
                            <Button
                                disabled={leftWidth === 50}
                                onClick={setEqualReaderWidths}
                                startIcon={<VerticalSplitIcon />}
                            >
                                {t`Equal widths`}
                            </Button>
                            <Button
                                onClick={() => {
                                    const swappedAnchors = anchors
                                        .map(({ leftPage, rightPage }) => ({
                                            leftPage: rightPage,
                                            rightPage: leftPage,
                                        }))
                                        .toSorted((first, second) => first.leftPage - second.leftPage);
                                    AppStorage.local.setItem(
                                        getParallelReaderAlignmentKey(rightSelection, leftSelection),
                                        {
                                            anchors: swappedAnchors,
                                            isSyncEnabled: syncMode === 'lockstep' ? false : isSyncEnabled,
                                            leftReaderSettings: rightReaderSettings,
                                            leftPosition: rightPosition,
                                            leftWidth: 100 - leftWidth,
                                            lockstepCalibrated: false,
                                            lockstepMarkers: lockstepMarkers
                                                ? {
                                                      start: {
                                                          left: lockstepMarkers.start.right,
                                                          right: lockstepMarkers.start.left,
                                                      },
                                                      end: {
                                                          left: lockstepMarkers.end.right,
                                                          right: lockstepMarkers.end.left,
                                                      },
                                                  }
                                                : undefined,
                                            percentageOffset: -percentageOffset,
                                            rightReaderSettings: leftReaderSettings,
                                            rightPosition: leftPosition,
                                            syncMode,
                                            version: 4,
                                        },
                                    );
                                    onSwap();
                                }}
                                startIcon={<CompareArrowsIcon />}
                            >
                                {t`Swap readers`}
                            </Button>
                        </Stack>
                    </Stack>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Stack spacing={1.5}>
                            <Stack
                                direction={{ xs: 'column', sm: 'row' }}
                                spacing={1}
                                sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
                            >
                                <Box>
                                    <Typography component="h2" variant="h6">
                                        {t`How should the readers move together?`}
                                    </Typography>
                                    <Typography color="text.secondary" variant="body2">
                                        {t`Scroll either reader. The other one follows using the method you choose below.`}
                                    </Typography>
                                </Box>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={isSyncEnabled}
                                            disabled={isAdjustingAlignment}
                                            onChange={(event) => handleSyncToggle(event.target.checked)}
                                        />
                                    }
                                    label={t`Scroll together`}
                                />
                            </Stack>
                            <ToggleButtonGroup
                                aria-label={t`Synchronization method`}
                                color="primary"
                                exclusive
                                fullWidth
                                onChange={handleModeChange}
                                value={syncMode}
                            >
                                <ToggleButton sx={{ textTransform: 'none' }} value="page">
                                    <Stack sx={{ alignItems: 'flex-start', textAlign: 'left' }}>
                                        <Typography sx={{ fontWeight: 'medium' }}>{t`Matching pages`}</Typography>
                                        <Typography color="text.secondary" variant="caption">
                                            {t`Same page and position`}
                                        </Typography>
                                    </Stack>
                                </ToggleButton>
                                <ToggleButton sx={{ textTransform: 'none' }} value="percentage">
                                    <Stack sx={{ alignItems: 'flex-start', textAlign: 'left' }}>
                                        <Typography sx={{ fontWeight: 'medium' }}>{t`Chapter progress`}</Typography>
                                        <Typography color="text.secondary" variant="caption">
                                            {t`Same relative progress`}
                                        </Typography>
                                    </Stack>
                                </ToggleButton>
                                <ToggleButton sx={{ textTransform: 'none' }} value="lockstep">
                                    <Stack sx={{ alignItems: 'flex-start', textAlign: 'left' }}>
                                        <Typography
                                            sx={{ fontWeight: 'medium' }}
                                        >{t`Same content movement`}</Typography>
                                        <Typography color="text.secondary" variant="caption">
                                            {t`Uses matching start and end scenes despite different page counts or image sizes`}
                                        </Typography>
                                    </Stack>
                                </ToggleButton>
                            </ToggleButtonGroup>
                            {isAdjustingAlignment ? (
                                <Alert severity="warning">
                                    <Stack spacing={1}>
                                        <Typography>
                                            {t`Synchronization is paused. Move each reader independently until the same scene crosses the orange guide.`}
                                        </Typography>
                                        <Typography variant="body2">
                                            {syncMode === 'page' &&
                                                t`This saves the two current pages as a match for page synchronization.`}
                                            {syncMode === 'percentage' &&
                                                t`This saves the difference between the two current chapter positions.`}
                                            {syncMode === 'lockstep' &&
                                                (lockstepMarkerStage === 'start'
                                                    ? t`First, align the beginning of the matching scene and save it. The readers will then move to their last pages so you can align the ending scene.`
                                                    : t`Now align the ending of the matching scene and save it. The orange start and green end markers can also be dragged directly in either reader.`)}
                                        </Typography>
                                        {alignmentError && (
                                            <Typography color="error">
                                                {syncMode === 'lockstep'
                                                    ? t`The ending scene must be after the beginning in both readers.`
                                                    : t`That page match conflicts with an existing match. Edit the page matches below and try again.`}
                                            </Typography>
                                        )}
                                        <Stack direction="row" spacing={1}>
                                            <Button onClick={useCurrentPositions} variant="contained">
                                                {alignmentActionLabel}
                                            </Button>
                                            <Button onClick={cancelAlignmentAdjustment}>{t`Cancel`}</Button>
                                        </Stack>
                                    </Stack>
                                </Alert>
                            ) : (
                                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Button
                                        onClick={
                                            syncMode === 'lockstep'
                                                ? () => startLockstepMarkerSelection()
                                                : startAlignmentAdjustment
                                        }
                                        startIcon={<TuneIcon />}
                                        variant="contained"
                                    >
                                        {syncMode === 'lockstep' ? t`Set start and end positions` : t`Adjust alignment`}
                                    </Button>
                                    {syncMode !== 'lockstep' && (
                                        <>
                                            <Button
                                                disabled={!isSyncEnabled}
                                                onClick={() => alignFromLeft(leftPosition)}
                                                startIcon={<KeyboardDoubleArrowRightIcon />}
                                            >
                                                {t`Align from Reader A`}
                                            </Button>
                                            <Button
                                                disabled={!isSyncEnabled}
                                                onClick={() => alignFromRight(rightPosition)}
                                                startIcon={<KeyboardDoubleArrowLeftIcon />}
                                            >
                                                {t`Align from Reader B`}
                                            </Button>
                                        </>
                                    )}
                                </Stack>
                            )}
                        </Stack>
                    </Paper>
                    {syncMode === 'page' && (
                        <PageAnchorEditor
                            anchors={anchors}
                            leftPageCount={leftSelection.chapter.pageCount}
                            leftPosition={leftPosition}
                            onChange={setAnchors}
                            onGoTo={goToAnchor}
                            rightPageCount={rightSelection.chapter.pageCount}
                            rightPosition={rightPosition}
                        />
                    )}
                </Stack>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflowX: 'auto' }}>
                <Box
                    ref={containerRef}
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `${leftWidth}fr 8px ${100 - leftWidth}fr`,
                        height: '100%',
                        minWidth: 720,
                    }}
                >
                    <ParallelReaderPane
                        alignmentGuideColor={alignmentGuideColor}
                        alignmentGuideLabel={alignmentGuideLabel}
                        readerLabel={t`Reader A`}
                        onPositionRestored={() => setRestoredSides((value) => value | 1)}
                        onScroll={handleLeftScroll}
                        pageElementsRef={leftPageElementsRef}
                        initialPosition={leftPosition}
                        isAutoScrollActive={activeAutoScrollSide === 'left'}
                        lockstepMarkerPositions={
                            lockstepMarkers
                                ? { start: lockstepMarkers.start.left, end: lockstepMarkers.end.left }
                                : undefined
                        }
                        onAutoScrollActiveChange={(isActive) => handleAutoScrollActiveChange('left', isActive)}
                        onLockstepMarkerChange={(marker, position) =>
                            handleLockstepMarkerChange('left', marker, position)
                        }
                        scrollRef={leftScrollRef}
                        selection={leftSelection}
                        settings={leftReaderSettings}
                        onSettingsChange={setLeftReaderSettings}
                        showAlignmentGuide={isAdjustingAlignment}
                    />
                    <Box
                        role="separator"
                        aria-label={t`Resize reader columns`}
                        aria-orientation="vertical"
                        aria-valuemax={75}
                        aria-valuemin={25}
                        aria-valuenow={Math.round(leftWidth)}
                        onKeyDown={handleResizeKeyDown}
                        onPointerDown={handleResizeStart}
                        tabIndex={0}
                        sx={{
                            cursor: 'col-resize',
                            bgcolor: isResizing ? 'primary.main' : 'divider',
                            outlineOffset: -2,
                            touchAction: 'none',
                        }}
                    />
                    <ParallelReaderPane
                        alignmentGuideColor={alignmentGuideColor}
                        alignmentGuideLabel={alignmentGuideLabel}
                        readerLabel={t`Reader B`}
                        onPositionRestored={() => setRestoredSides((value) => value | 2)}
                        onScroll={handleRightScroll}
                        pageElementsRef={rightPageElementsRef}
                        initialPosition={rightPosition}
                        isAutoScrollActive={activeAutoScrollSide === 'right'}
                        lockstepMarkerPositions={
                            lockstepMarkers
                                ? { start: lockstepMarkers.start.right, end: lockstepMarkers.end.right }
                                : undefined
                        }
                        onAutoScrollActiveChange={(isActive) => handleAutoScrollActiveChange('right', isActive)}
                        onLockstepMarkerChange={(marker, position) =>
                            handleLockstepMarkerChange('right', marker, position)
                        }
                        scrollRef={rightScrollRef}
                        selection={rightSelection}
                        settings={rightReaderSettings}
                        onSettingsChange={setRightReaderSettings}
                        showAlignmentGuide={isAdjustingAlignment}
                    />
                </Box>
            </Box>
        </Stack>
    );
};
