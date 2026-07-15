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
import Drawer from '@mui/material/Drawer';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { useLingui } from '@lingui/react/macro';
import type {
    ParallelLockstepMarkers,
    ParallelPagePosition,
    ParallelReaderSide,
    ParallelReaderSideSelection,
} from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { useParallelChapterPages } from '@/features/parallel-reader/hooks/useParallelChapterPages.ts';
import { coerceIn, getErrorMessage } from '@/lib/HelperFunctions.ts';

type MarkerName = keyof Pick<ParallelLockstepMarkers, 'start' | 'end'>;

type MarkerPreviewProps = {
    markers: ParallelLockstepMarkers;
    onMarkerChange: (marker: MarkerName, side: ParallelReaderSide, position: ParallelPagePosition) => void;
    open: boolean;
    readerLabel: string;
    selection: Required<ParallelReaderSideSelection>;
    side: ParallelReaderSide;
};

const markerStyles: Record<MarkerName, { backgroundColor: string; color: string }> = {
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
    const lastPage = pages[pages.length - 1];
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

const MarkerPreview = ({ markers, onMarkerChange, open, readerLabel, selection, side }: MarkerPreviewProps) => {
    const { t } = useLingui();
    const { chapter, source } = selection;
    const { error, loading, pages } = useParallelChapterPages(chapter.id, source.id);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const pageElementsRef = useRef<(HTMLElement | null)[]>([]);
    const draggingMarkerRef = useRef<MarkerName | undefined>(undefined);
    const didFocusEndRef = useRef<string | undefined>(undefined);
    const selectionKey = `${source.id}:${chapter.id}`;

    useEffect(() => {
        if (!open) {
            didFocusEndRef.current = undefined;
        }
    }, [open]);

    const updateMarkerFromPointer = useCallback(
        (marker: MarkerName, clientY: number) => {
            const position = getPositionAtClientY(pageElementsRef.current, clientY);
            if (position) {
                onMarkerChange(marker, side, position);
            }
        },
        [onMarkerChange, side],
    );

    useEffect(() => {
        if (!open || !pages.length || didFocusEndRef.current === selectionKey) {
            return;
        }

        const endPage = pageElementsRef.current[markers.end[side].pageIndex];
        if (!endPage) {
            return;
        }

        const frame = requestAnimationFrame(() => {
            const scrollElement = scrollRef.current;
            if (!scrollElement) {
                return;
            }

            const readerBounds = scrollElement.getBoundingClientRect();
            const pageBounds = endPage.getBoundingClientRect();
            scrollElement.scrollBy({
                top: pageBounds.top - readerBounds.top - scrollElement.clientHeight / 2 + pageBounds.height / 2,
            });
            didFocusEndRef.current = selectionKey;
        });
        return () => cancelAnimationFrame(frame);
    }, [markers.end, open, pages.length, selectionKey, side]);

    const handleMarkerPointerDown = (marker: MarkerName, event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        draggingMarkerRef.current = marker;
        updateMarkerFromPointer(marker, event.clientY);
    };

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
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

    const stopDragging = () => {
        draggingMarkerRef.current = undefined;
    };

    return (
        <Paper
            ref={scrollRef}
            component="section"
            onPointerCancel={stopDragging}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            variant="outlined"
            sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}
        >
            <Stack
                component="header"
                direction="row"
                spacing={1}
                sx={{ position: 'sticky', top: 0, zIndex: 2, alignItems: 'center', bgcolor: 'background.paper', p: 1 }}
            >
                <Chip color="primary" label={readerLabel} size="small" variant="outlined" />
                <Typography noWrap variant="body2">
                    {selection.manga.title}
                </Typography>
            </Stack>
            {loading && (
                <Box sx={{ display: 'grid', minHeight: 200, placeItems: 'center' }}>
                    <CircularProgress size={28} />
                </Box>
            )}
            {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
            {!loading && !error && (
                <Box sx={{ bgcolor: 'common.black', pb: 2 }}>
                    {pages.map((page, pageIndex) => (
                        <Box
                            key={page}
                            ref={(element: HTMLDivElement | null) => {
                                pageElementsRef.current[pageIndex] = element;
                            }}
                            sx={{ position: 'relative', minHeight: 20 }}
                        >
                            <Box
                                alt={t`Page ${pageIndex + 1}`}
                                component="img"
                                loading="lazy"
                                src={page}
                                sx={{ display: 'block', minHeight: 20, width: '100%' }}
                            />
                            {(Object.keys(markerStyles) as MarkerName[]).map(
                                (marker) =>
                                    markers[marker][side].pageIndex === pageIndex && (
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
                                                top: `${markers[marker][side].progress * 100}%`,
                                                right: 0,
                                                left: 0,
                                                zIndex: 1,
                                                cursor: 'ns-resize',
                                                touchAction: 'none',
                                                transform: 'translateY(-50%)',
                                            }}
                                        >
                                            <Box
                                                sx={{ borderTop: 3, borderColor: markerStyles[marker].backgroundColor }}
                                            />
                                            <Typography
                                                component="span"
                                                sx={{
                                                    display: 'inline-block',
                                                    px: 0.75,
                                                    py: 0.25,
                                                    borderRadius: 1,
                                                    bgcolor: markerStyles[marker].backgroundColor,
                                                    color: markerStyles[marker].color,
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {marker === 'start' ? t`Start` : t`End`}
                                            </Typography>
                                        </Box>
                                    ),
                            )}
                        </Box>
                    ))}
                </Box>
            )}
        </Paper>
    );
};

type LockstepMarkerEditorProps = {
    error?: boolean;
    leftSelection: Required<ParallelReaderSideSelection>;
    markers: ParallelLockstepMarkers;
    onCancel: () => void;
    onMarkerChange: (marker: MarkerName, side: ParallelReaderSide, position: ParallelPagePosition) => void;
    onSave: () => void;
    open: boolean;
    rightSelection: Required<ParallelReaderSideSelection>;
};

export const LockstepMarkerEditor = ({
    error = false,
    leftSelection,
    markers,
    onCancel,
    onMarkerChange,
    onSave,
    open,
    rightSelection,
}: LockstepMarkerEditorProps) => {
    const { t } = useLingui();

    return (
        <Drawer
            anchor="bottom"
            onClose={onCancel}
            open={open}
            slotProps={{ paper: { sx: { height: 'min(68dvh, 720px)', px: 1, pb: 1 } } }}
        >
            <Stack spacing={1} sx={{ height: '100%' }}>
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', pt: 1 }}
                >
                    <Box>
                        <Typography component="h2" variant="h6">
                            {t`Match the beginning and end`}
                        </Typography>
                        <Typography color="text.secondary" variant="body2">
                            {t`This panel opens from the bottom. Scroll each mini view, then drag the orange start and green end markers onto the same scenes.`}
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button onClick={onCancel}>{t`Cancel`}</Button>
                        <Button onClick={onSave} variant="contained">
                            {t`Use both markers`}
                        </Button>
                    </Stack>
                </Stack>
                {error && (
                    <Alert severity="error">{t`The end marker must be after the start marker in both readers.`}</Alert>
                )}
                <Stack direction="row" spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                    <MarkerPreview
                        markers={markers}
                        onMarkerChange={onMarkerChange}
                        open={open}
                        readerLabel={t`Reader A`}
                        selection={leftSelection}
                        side="left"
                    />
                    <MarkerPreview
                        markers={markers}
                        onMarkerChange={onMarkerChange}
                        open={open}
                        readerLabel={t`Reader B`}
                        selection={rightSelection}
                        side="right"
                    />
                </Stack>
            </Stack>
        </Drawer>
    );
};
