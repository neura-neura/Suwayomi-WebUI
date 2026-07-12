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
import type { RefObject } from 'react';
import { useLingui } from '@lingui/react/macro';
import { SpinnerImage } from '@/base/components/SpinnerImage.tsx';
import type {
    ParallelPagePosition,
    ParallelReaderSideSelection,
} from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { useParallelChapterPages } from '@/features/parallel-reader/hooks/useParallelChapterPages.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import {
    getVisiblePagePosition,
    PAGE_READING_POINT_RATIO,
    scrollToPagePosition,
} from '@/features/parallel-reader/utils/PageVisibility.ts';

type ParallelReaderPaneProps = {
    initialPosition: ParallelPagePosition;
    onPositionRestored?: () => void;
    onScroll: (position: ParallelPagePosition | undefined) => void;
    pageElementsRef: RefObject<(HTMLElement | null)[]>;
    readerLabel: string;
    scrollRef: RefObject<HTMLDivElement | null>;
    selection: Required<ParallelReaderSideSelection>;
    showAlignmentGuide?: boolean;
};

const PAGE_PRELOAD_RADIUS = 3;

export const ParallelReaderPane = ({
    initialPosition,
    onPositionRestored,
    onScroll,
    pageElementsRef,
    readerLabel,
    scrollRef,
    selection,
    showAlignmentGuide = false,
}: ParallelReaderPaneProps) => {
    const { t } = useLingui();
    const { chapter, manga, source } = selection;
    const { pages, loading, error, refetch } = useParallelChapterPages(chapter.id, source.id);
    const [currentPosition, setCurrentPosition] = useState<ParallelPagePosition>(initialPosition);
    const restoredSelectionIdRef = useRef<string | undefined>(undefined);
    const selectionId = `${source.id}:${manga.id}:${chapter.id}`;

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
                onScroll={handleScroll}
                tabIndex={0}
                variant="outlined"
                sx={{ height: '100%', minWidth: 0, overflow: 'auto', overscrollBehavior: 'contain' }}
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
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Chip color="primary" label={readerLabel} size="small" variant="outlined" />
                        <Typography component="h2" noWrap variant="subtitle1">
                            {manga.title}
                        </Typography>
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
                <Stack sx={{ alignItems: 'center', bgcolor: 'common.black' }}>
                    {pages.map((page, index) => (
                        <Box
                            key={page}
                            data-page-index={index}
                            ref={(element: HTMLDivElement | null) => {
                                const pageElements = pageElementsRef.current;
                                pageElements[index] = element;
                            }}
                            sx={{ display: 'grid', minHeight: '65vh', width: '100%', placeItems: 'center' }}
                        >
                            <SpinnerImage
                                alt={t`Page ${index + 1}`}
                                src={page}
                                shouldLoad={Math.abs(index - currentPosition.pageIndex) <= PAGE_PRELOAD_RADIUS}
                                shouldDecode
                                onLoad={updateVisiblePosition}
                                spinnerStyle={{ minHeight: '65vh', width: '100%' }}
                                imgStyle={{ display: 'block', height: 'auto', maxWidth: '100%', width: '100%' }}
                                hideImgStyle={{ minHeight: 0 }}
                            />
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
                        borderColor: 'warning.main',
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
                            bgcolor: 'warning.main',
                            color: 'warning.contrastText',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                        }}
                    >
                        {t`Align this scene`}
                    </Typography>
                </Box>
            )}
        </Box>
    );
};
