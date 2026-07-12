/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useLingui } from '@lingui/react/macro';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { ParallelChapterSelector } from '@/features/parallel-reader/components/ParallelChapterSelector.tsx';
import type { ParallelReaderSideSelection } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { ParallelReaderWorkspace } from '@/features/parallel-reader/components/ParallelReaderWorkspace.tsx';
import { useLocalStorage } from '@/base/hooks/useStorage.tsx';
import {
    PARALLEL_READER_LEFT_SELECTION_KEY,
    PARALLEL_READER_OPEN_KEY,
    PARALLEL_READER_RIGHT_SELECTION_KEY,
} from '@/features/parallel-reader/services/ParallelReaderPersistence.ts';

export const ParallelReader = () => {
    const { t } = useLingui();
    const [leftSelection, setLeftSelection] = useLocalStorage<ParallelReaderSideSelection>(
        PARALLEL_READER_LEFT_SELECTION_KEY,
        {},
    );
    const [rightSelection, setRightSelection] = useLocalStorage<ParallelReaderSideSelection>(
        PARALLEL_READER_RIGHT_SELECTION_KEY,
        {},
    );
    const [isReady, setIsReady] = useLocalStorage(PARALLEL_READER_OPEN_KEY, false);

    useAppTitle(t`Parallel Reader`);

    if (
        isReady &&
        leftSelection.source &&
        leftSelection.manga &&
        leftSelection.chapter &&
        rightSelection.source &&
        rightSelection.manga &&
        rightSelection.chapter
    ) {
        return (
            <ParallelReaderWorkspace
                leftSelection={{
                    source: leftSelection.source,
                    manga: leftSelection.manga,
                    chapter: leftSelection.chapter,
                }}
                rightSelection={{
                    source: rightSelection.source,
                    manga: rightSelection.manga,
                    chapter: rightSelection.chapter,
                }}
                onClose={() => setIsReady(false)}
                onSwap={() => {
                    setLeftSelection(rightSelection);
                    setRightSelection(leftSelection);
                }}
            />
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Typography color="text.secondary">{t`Choose two chapters to start reading in parallel.`}</Typography>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
                    <ParallelChapterSelector
                        label={t`Left side`}
                        selection={leftSelection}
                        onChange={(selection) => {
                            setLeftSelection(selection);
                            setIsReady(false);
                        }}
                    />
                    <ParallelChapterSelector
                        label={t`Right side`}
                        selection={rightSelection}
                        onChange={(selection) => {
                            setRightSelection(selection);
                            setIsReady(false);
                        }}
                    />
                </Box>
                <Button
                    disabled={!leftSelection.chapter || !rightSelection.chapter}
                    onClick={() => setIsReady(true)}
                    variant="contained"
                >
                    {t`Open parallel reader`}
                </Button>
            </Stack>
        </Box>
    );
};
