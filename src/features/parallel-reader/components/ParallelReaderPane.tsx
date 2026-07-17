/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent, RefObject } from 'react';
import { useLingui } from '@lingui/react/macro';
import { SpinnerImage } from '@/base/components/SpinnerImage.tsx';
import type {
    ParallelLockstepMarkerName,
    ParallelPagePosition,
    ParallelReaderPaneSettings,
    ParallelReaderSideSelection,
} from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { useParallelChapterPages } from '@/features/parallel-reader/hooks/useParallelChapterPages.ts';
import { coerceIn, getErrorMessage } from '@/lib/HelperFunctions.ts';
import {
    getVisiblePagePosition,
    PAGE_READING_POINT_RATIO,
    scrollToPagePosition,
} from '@/features/parallel-reader/utils/PageVisibility.ts';
import { ParallelReaderPaneControls } from '@/features/parallel-reader/components/ParallelReaderPaneControls.tsx';
import { ScrollDirection } from '@/base/Base.types.ts';
import { useAutomaticScrolling } from '@/base/hooks/useAutomaticScrolling.ts';
import { ReaderPageScaleMode, ReaderScrollAmount } from '@/features/reader/Reader.types.ts';

type ParallelReaderPaneProps = {
    alignmentGuideColor?: 'warning' | 'success';
    alignmentGuideLabel?: string;
    initialPosition: ParallelPagePosition;
    isAutoScrollActive: boolean;
    lockstepMarkerPositions?: Partial<Record<ParallelLockstepMarkerName, ParallelPagePosition>>;
    onAutoScrollActiveChange: (isActive: boolean) => void;
    onLockstepMarkerChange?: (marker: ParallelLockstepMarkerName, position: ParallelPagePosition) => void;
    onPositionRestored?: () => void;
    onScroll: (position: ParallelPagePosition | undefined) => void;
    onSettingsChange: (settings: ParallelReaderPaneSettings) => void;
    pageElementsRef: RefObject<(HTMLElement | null)[]>;
    readerLabel: string;
    scrollRef: RefObject<HTMLDivElement | null>;
    selection: Required<ParallelReaderSideSelection>;
    settings: ParallelReaderPaneSettings;
    showAlignmentGuide?: boolean;
};

const PAGE_PRELOAD_RADIUS = 3;
const LOCKSTEP_MARKER_STYLES: Record<ParallelLockstepMarkerName, { backgroundColor: string; color: string }> = {
    start: { backgroundColor: 'warning.main', color: 'warning.contrastText' },
    end: { backgroundColor: 'success.main', color: 'success.contrastText' },
};

const getPositionAtClientY = (
    pageElements: (HTMLElement | null)[],
    clientY: number,
): ParallelPagePosition | undefined => {
    const pages = pageElements
        .map((element, pageIndex) => ({ element, pageIndex }))
        .filter((page): page is { element: HTMLElement; pageIndex: number } => page.element !== null);
    if (!pages.length) {
        return undefined;
    }

    const [firstPage] = pages;
    const lastPage = pages.at(-1)!;
    const page =
        pages.find(({ element }) => {
            const bounds = element.getBoundingClientRect();
            return bounds.top <= clientY && bounds.bottom >= clientY;
        }) ??
        (clientY < firstPage.element.getBoundingClientRect().top
            ? firstPage
            : (pages.find(({ element }) => element.getBoundingClientRect().top > clientY) ?? lastPage));
    const bounds = page.element.getBoundingClientRect();
    const progress = bounds.height ? coerceIn((clientY - bounds.top) / bounds.height, 0, 1) : 0;

    return { pageIndex: page.pageIndex, progress };
};

export const ParallelReaderPane = ({
    alignmentGuideColor = 'warning',
    alignmentGuideLabel,
    initialPosition,
    isAutoScrollActive,
    lockstepMarkerPositions,
    onAutoScrollActiveChange,
    onLockstepMarkerChange,
    onPositionRestored,
    onScroll,
    onSettingsChange,
    pageElementsRef,
    readerLabel,
    scrollRef,
    selection,
    settings,
    showAlignmentGuide = false,
}: ParallelReaderPaneProps) => {
    const { t } = useLingui();
    const { chapter, manga, source } = selection;
    const { pages, loading, error, refetch } = useParallelChapterPages(chapter.id, source.id);
    const [currentPosition, setCurrentPosition] = useState<ParallelPagePosition>(initialPosition);
    const restoredSelectionIdRef = useRef<string | undefined>(undefined);
    const draggingMarkerRef = useRef<ParallelLockstepMarkerName | undefined>(undefined);
    const selectionId = `${source.id}:${manga.id}:${chapter.id}`;
    const automaticScrolling = useAutomaticScrolling(
        scrollRef as MutableRefObject<HTMLElement | null>,
        settings.autoScroll.value,
        ScrollDirection.Y,
        ReaderScrollAmount.MEDIUM,
        false,
        settings.autoScroll.smooth,
    );

    useEffect(() => {
        if (isAutoScrollActive && !automaticScrolling.isActive) {
            automaticScrolling.start();
        } else if (!isAutoScrollActive && automaticScrolling.isActive) {
            automaticScrolling.cancel();
        }
    }, [automaticScrolling, isAutoScrollActive]);

    const updateVisiblePosition = useCallback(() => {
        if (!scrollRef.current) {
            return undefined;
        }

        const position = getVisiblePagePosition(scrollRef.current, pageElementsRef.current);
        if (position) {
            setCurrentPosition(position);
        }

        return position;
    }, [pageElementsRef, scrollRef]);

    const handleScroll = useCallback(() => {
        onScroll(updateVisiblePosition());
    }, [onScroll, updateVisiblePosition]);

    const updateMarkerFromPointer = useCallback(
        (marker: ParallelLockstepMarkerName, clientY: number) => {
            const position = getPositionAtClientY(pageElementsRef.current, clientY);
            if (position) {
                onLockstepMarkerChange?.(marker, position);
            }
        },
        [onLockstepMarkerChange, pageElementsRef],
    );

    const handleMarkerPointerDown = (marker: ParallelLockstepMarkerName, event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        draggingMarkerRef.current = marker;
        updateMarkerFromPointer(marker, event.clientY);
    };

    const handleMarkerPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const marker = draggingMarkerRef.current;
        const scrollElement = scrollRef.current;
        if (!marker || !scrollElement) {
            return;
        }

        const bounds = scrollElement.getBoundingClientRect();
        if (event.clientY < bounds.top + 36) {
            scrollElement.scrollBy({ top: -20 });
        } else if (event.clientY > bounds.bottom - 36) {
            scrollElement.scrollBy({ top: 20 });
        }
        updateMarkerFromPointer(marker, event.clientY);
    };

    const stopMarkerDragging = () => {
        draggingMarkerRef.current = undefined;
    };

    const goToPage = useCallback(
        (pageIndex: number) => {
            if (pageIndex < 0 || pageIndex >= pages.length || !scrollRef.current) {
                return;
            }

            const nextPosition = { pageIndex, progress: 0 };
            scrollToPagePosition(scrollRef.current, pageElementsRef.current, nextPosition);
            setCurrentPosition(nextPosition);
            onScroll(nextPosition);
        },
        [onScroll, pageElementsRef, pages.length, scrollRef],
    );

    const pageImageStyle = (() => {
        const viewportHeight = 'calc(100dvh - 230px)';

        switch (settings.pageScaleMode) {
            case ReaderPageScaleMode.HEIGHT:
                return {
                    display: 'block',
                    height: settings.shouldStretchPage ? viewportHeight : 'auto',
                    maxHeight: viewportHeight,
                    maxWidth: '100%',
                    width: 'auto',
                };
            case ReaderPageScaleMode.SCREEN:
                return {
                    display: 'block',
                    height: settings.shouldStretchPage ? viewportHeight : 'auto',
                    maxHeight: viewportHeight,
                    maxWidth: '100%',
                    width: settings.shouldStretchPage ? '100%' : 'auto',
                };
            case ReaderPageScaleMode.ORIGINAL:
                return { display: 'block', height: 'auto', maxWidth: 'none', width: 'auto' };
            case ReaderPageScaleMode.WIDTH:
            default:
                return { display: 'block', height: 'auto', maxWidth: '100%', width: '100%' };
        }
    })();

    useEffect(() => {
        if (!pages.length || restoredSelectionIdRef.current === selectionId || !scrollRef.current) {
            return;
        }

        const restoreFrame = requestAnimationFrame(() => {
            if (!scrollRef.current) {
                return;
            }

            scrollToPagePosition(scrollRef.current, pageElementsRef.current, initialPosition);
            restoredSelectionIdRef.current = selectionId;
            setCurrentPosition(initialPosition);
            onPositionRestored?.();
        });

        return () => cancelAnimationFrame(restoreFrame);
    }, [initialPosition, onPositionRestored, pageElementsRef, pages.length, scrollRef, selectionId]);

    return (
        <Box sx={{ position: 'relative', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
            <Paper
                ref={scrollRef}
                component="section"
                onPointerCancel={stopMarkerDragging}
                onPointerMove={handleMarkerPointerMove}
                onPointerUp={stopMarkerDragging}
                onScroll={handleScroll}
                tabIndex={0}
                variant="outlined"
                sx={{
                    height: '100%',
                    minWidth: 0,
                    overflow: 'auto',
                    overscrollBehavior: 'contain',
                    scrollSnapType: settings.readingMode === 'single' ? 'y mandatory' : undefined,
                }}
            >
                <Stack
                    component="header"
                    spacing={0.5}
                    sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        borderBottom: 1,
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                        p: 1.5,
                    }}
                >
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <Chip color="primary" label={readerLabel} size="small" variant="outlined" />
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                            <Typography component="h2" noWrap variant="subtitle1">
                                {manga.title}
                            </Typography>
                            <ParallelReaderPaneControls
                                currentPosition={currentPosition}
                                isAutoScrollActive={isAutoScrollActive}
                                onAutoScrollActiveChange={onAutoScrollActiveChange}
                                onGoToPage={goToPage}
                                onSettingsChange={onSettingsChange}
                                pageCount={pages.length}
                                readerLabel={readerLabel}
                                settings={settings}
                            />
                        </Stack>
                    </Stack>
                    <Typography color="text.secondary" noWrap variant="body2">
                        {chapter.name} · {t`Page ${currentPosition.pageIndex + 1} of ${pages.length}`}
                    </Typography>
                </Stack>
                {loading && (
                    <Box sx={{ display: 'grid', minHeight: 240, placeItems: 'center' }}>
                        <CircularProgress />
                    </Box>
                )}
                {error && (
                    <Alert
                        action={
                            <Button color="inherit" onClick={refetch} size="small">
                                {t`Retry`}
                            </Button>
                        }
                        severity="error"
                    >
                        {getErrorMessage(error)}
                    </Alert>
                )}
                {!loading && !error && !pages.length && <Alert severity="info">{t`No pages found`}</Alert>}
                <Stack
                    sx={{
                        alignItems: 'center',
                        bgcolor: 'common.black',
                        gap: `${settings.pageGap}px`,
                    }}
                >
                    {pages.map((page, index) => (
                        <Box
                            key={page}
                            data-page-index={index}
                            ref={(element: HTMLDivElement | null) => {
                                const pageElements = pageElementsRef.current;
                                pageElements[index] = element;
                            }}
                            sx={{
                                display: 'grid',
                                minHeight: settings.readingMode === 'single' ? 'calc(100dvh - 230px)' : 0,
                                placeItems: 'center',
                                position: 'relative',
                                scrollSnapAlign: settings.readingMode === 'single' ? 'start' : undefined,
                                width: '100%',
                            }}
                        >
                            <SpinnerImage
                                alt={t`Page ${index + 1}`}
                                src={page}
                                shouldLoad={Math.abs(index - currentPosition.pageIndex) <= PAGE_PRELOAD_RADIUS}
                                shouldDecode
                                onLoad={updateVisiblePosition}
                                spinnerStyle={{
                                    minHeight: settings.readingMode === 'single' ? 'calc(100dvh - 230px)' : '65vh',
                                    width: '100%',
                                }}
                                imgStyle={pageImageStyle}
                                hideImgStyle={{ minHeight: 0 }}
                            />
                            {(Object.keys(LOCKSTEP_MARKER_STYLES) as ParallelLockstepMarkerName[]).map((marker) => {
                                const markerPosition = lockstepMarkerPositions?.[marker];
                                if (!markerPosition || markerPosition.pageIndex !== index) {
                                    return null;
                                }

                                return (
                                    <Box
                                        aria-label={
                                            marker === 'start'
                                                ? t`Start marker. Drag to change its position.`
                                                : t`End marker. Drag to change its position.`
                                        }
                                        key={marker}
                                        onPointerDown={(event: PointerEvent<HTMLDivElement>) =>
                                            handleMarkerPointerDown(marker, event)
                                        }
                                        role="button"
                                        sx={{
                                            position: 'absolute',
                                            top: `${markerPosition.progress * 100}%`,
                                            right: 0,
                                            left: 0,
                                            zIndex: 2,
                                            cursor: 'ns-resize',
                                            touchAction: 'none',
                                            transform: 'translateY(-50%)',
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                borderTop: 3,
                                                borderColor: LOCKSTEP_MARKER_STYLES[marker].backgroundColor,
                                            }}
                                        />
                                        <Typography
                                            component="span"
                                            sx={{
                                                display: 'inline-block',
                                                px: 0.75,
                                                py: 0.25,
                                                borderRadius: 1,
                                                bgcolor: LOCKSTEP_MARKER_STYLES[marker].backgroundColor,
                                                color: LOCKSTEP_MARKER_STYLES[marker].color,
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {marker === 'start' ? t`Start` : t`End`}
                                        </Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    ))}
                </Stack>
            </Paper>
            {showAlignmentGuide && (
                <Box
                    aria-hidden
                    sx={{
                        position: 'absolute',
                        top: `${PAGE_READING_POINT_RATIO * 100}%`,
                        right: 0,
                        left: 0,
                        zIndex: 3,
                        borderTop: 2,
                        borderColor: `${alignmentGuideColor}.main`,
                        pointerEvents: 'none',
                    }}
                >
                    <Typography
                        component="span"
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 12,
                            px: 1,
                            py: 0.25,
                            borderRadius: '0 0 4px 4px',
                            bgcolor: `${alignmentGuideColor}.main`,
                            color: `${alignmentGuideColor}.contrastText`,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                        }}
                    >
                        {alignmentGuideLabel ?? t`Align this scene`}
                    </Typography>
                </Box>
            )}
        </Box>
    );
};
