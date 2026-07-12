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
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { useLingui } from '@lingui/react/macro';
import { SpinnerImage } from '@/base/components/SpinnerImage.tsx';
import type {
    ParallelPagePosition,
    ParallelReaderSideSelection,
} from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { useParallelChapterPages } from '@/features/parallel-reader/hooks/useParallelChapterPages.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { getVisiblePagePosition } from '@/features/parallel-reader/utils/PageVisibility.ts';

type ParallelReaderPaneProps = {
    onScroll: (position: ParallelPagePosition | undefined) => void;
    pageElementsRef: RefObject<(HTMLElement | null)[]>;
    scrollRef: RefObject<HTMLDivElement | null>;
    selection: Required<ParallelReaderSideSelection>;
};

export const ParallelReaderPane = ({ onScroll, pageElementsRef, scrollRef, selection }: ParallelReaderPaneProps) => {
    const { t } = useLingui();
    const { chapter, manga, source } = selection;
    const { pages, loading, error, refetch } = useParallelChapterPages(chapter.id, source.id);
    const [currentPosition, setCurrentPosition] = useState<ParallelPagePosition>({ pageIndex: 0, progress: 0 });

    const updatePagePosition = useCallback(() => {
        if (!scrollRef.current) {
            return;
        }

        const position = getVisiblePagePosition(scrollRef.current, pageElementsRef.current);
        if (position) {
            setCurrentPosition(position);
        }
        onScroll(position);
    }, [onScroll, pageElementsRef, scrollRef]);

    return (
        <Paper
            ref={scrollRef}
            component="section"
            onScroll={updatePagePosition}
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
                <Typography component="h2" noWrap variant="subtitle1">
                    {manga.title}
                </Typography>
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
                            shouldDecode
                            onLoad={updatePagePosition}
                            spinnerStyle={{ minHeight: '65vh', width: '100%' }}
                            imgStyle={{ display: 'block', height: 'auto', maxWidth: '100%', width: '100%' }}
                            hideImgStyle={{ minHeight: 0 }}
                        />
                    </Box>
                ))}
            </Stack>
        </Paper>
    );
};
