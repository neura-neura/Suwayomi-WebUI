/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useLingui } from '@lingui/react/macro';
import type { ParallelReaderSideSelection } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { useParallelChapterPages } from '@/features/parallel-reader/hooks/useParallelChapterPages.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';

export const ParallelChapterPagesPreview = ({ selection }: { selection: Required<ParallelReaderSideSelection> }) => {
    const { t } = useLingui();
    const { chapter, manga, source } = selection;

    const { pages, loading, error, refetch } = useParallelChapterPages(chapter.id, source.id);

    return (
        <Paper variant="outlined" sx={{ minWidth: 0, p: 2 }}>
            <Stack spacing={1}>
                <Typography component="h3" variant="h6">
                    {manga.title}
                </Typography>
                <Typography color="text.secondary">{chapter.name}</Typography>
                <Typography>{t`${pages.length} pages`}</Typography>
                {loading && <CircularProgress size={24} />}
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
                {!!pages.length && (
                    <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                        {pages.map((page, index) => (
                            <ListItem key={page}>
                                <ListItemText primary={t`Page ${index + 1}`} secondary={page} />
                            </ListItem>
                        ))}
                    </List>
                )}
            </Stack>
        </Paper>
    );
};
