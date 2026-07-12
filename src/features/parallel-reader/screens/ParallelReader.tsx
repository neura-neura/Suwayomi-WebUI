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
import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { ParallelChapterSelector } from '@/features/parallel-reader/components/ParallelChapterSelector.tsx';
import type { ParallelReaderSideSelection } from '@/features/parallel-reader/types/ParallelReader.types.ts';

export const ParallelReader = () => {
    const { t } = useLingui();
    const [leftSelection, setLeftSelection] = useState<ParallelReaderSideSelection>({});
    const [rightSelection, setRightSelection] = useState<ParallelReaderSideSelection>({});
    const [isReady, setIsReady] = useState(false);

    useAppTitle(t`Parallel Reader`);

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
                {isReady && leftSelection.chapter && rightSelection.chapter && (
                    <Typography sx={{ textAlign: 'center' }}>
                        {leftSelection.manga?.title} — {leftSelection.chapter.name} | {rightSelection.manga?.title} —{' '}
                        {rightSelection.chapter.name}
                    </Typography>
                )}
            </Stack>
        </Box>
    );
};
