/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useLingui } from '@lingui/react/macro';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { GET_CHAPTERS_READER } from '@/lib/graphql/chapter/ChapterQuery.ts';
import type { GetChaptersReaderQuery, SourceBaseFieldsFragment } from '@/lib/graphql/generated/graphql.ts';
import type { ParallelReaderSideSelection } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { STABLE_EMPTY_ARRAY } from '@/base/Base.constants.ts';
import { GET_SOURCES_BASE } from '@/lib/graphql/source/SourceQuery.ts';

type ParallelReaderSourcesQuery = {
    sources: {
        nodes: SourceBaseFieldsFragment[];
    };
};

type ParallelChapterSelectorProps = {
    label: string;
    selection: ParallelReaderSideSelection;
    onChange: (selection: ParallelReaderSideSelection) => void;
};

export const ParallelChapterSelector = ({ label, selection, onChange }: ParallelChapterSelectorProps) => {
    const { t } = useLingui();
    const [query, setQuery] = useState('');
    const [submittedQuery, setSubmittedQuery] = useState('');
    const [refreshError, setRefreshError] = useState<string>();
    const [isRefreshingManga, setIsRefreshingManga] = useState(false);

    const sourcesResponse = requestManager.useGetSources<ParallelReaderSourcesQuery, Record<string, never>>(
        GET_SOURCES_BASE,
        {},
    );
    const sourceId = selection.source?.id ?? '';
    const mangaId = selection.manga?.id;
    const [, searchPages] = requestManager.useSourceSearch(
        sourceId || '-1',
        submittedQuery,
        undefined,
        sourceId && submittedQuery ? 1 : 0,
    );
    const chaptersResponse = requestManager.useGetMangaChapters<GetChaptersReaderQuery>(
        GET_CHAPTERS_READER,
        mangaId ?? -1,
        { skip: mangaId === undefined },
    );

    const sources = sourcesResponse.data?.sources.nodes ?? STABLE_EMPTY_ARRAY;
    const mangas = useMemo(() => {
        const mangaIds = new Set<number>();

        return searchPages
            .flatMap((page) => page.data?.fetchSourceManga?.mangas ?? STABLE_EMPTY_ARRAY)
            .filter((manga) => {
                if (mangaIds.has(manga.id)) {
                    return false;
                }

                mangaIds.add(manga.id);
                return true;
            });
    }, [searchPages]);
    const chapters = chaptersResponse.data?.chapters.nodes ?? STABLE_EMPTY_ARRAY;
    const searchError = searchPages.find((page) => page.error)?.error;
    const isSearching = !!submittedQuery && searchPages.some((page) => page.isLoading);

    const handleSearch = (event: FormEvent) => {
        event.preventDefault();
        setSubmittedQuery(query.trim());
    };

    const handleMangaSelect = async (manga: (typeof mangas)[number]) => {
        onChange({
            ...selection,
            manga: { id: manga.id, sourceId: manga.sourceId, title: manga.title },
            chapter: undefined,
        });
        setRefreshError(undefined);
        setIsRefreshingManga(true);

        try {
            await requestManager.refreshManga(manga.id).response;
        } catch (error) {
            setRefreshError(getErrorMessage(error));
        } finally {
            setIsRefreshingManga(false);
        }
    };

    return (
        <Card variant="outlined" sx={{ minWidth: 0 }}>
            <CardContent>
                <Stack spacing={2}>
                    <Typography component="h2" variant="h6">
                        {label}
                    </Typography>
                    <TextField
                        select
                        fullWidth
                        label={t`Source`}
                        value={sourceId}
                        onChange={(event) => {
                            const source = sources.find((item) => item.id === event.target.value);
                            onChange(source ? { source: { id: source.id, displayName: source.displayName } } : {});
                            setSubmittedQuery('');
                        }}
                    >
                        {sources.map((source) => (
                            <MenuItem key={source.id} value={source.id}>
                                {source.displayName} ({source.lang})
                            </MenuItem>
                        ))}
                    </TextField>
                    <Stack component="form" direction="row" spacing={1} onSubmit={handleSearch}>
                        <TextField
                            fullWidth
                            disabled={!sourceId}
                            label={t`Search manga`}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                        <Button disabled={!sourceId || !query.trim()} type="submit" variant="contained">
                            {t`Search`}
                        </Button>
                    </Stack>
                    {sourcesResponse.error && <Alert severity="error">{getErrorMessage(sourcesResponse.error)}</Alert>}
                    {searchError && <Alert severity="error">{getErrorMessage(searchError)}</Alert>}
                    {refreshError && <Alert severity="error">{refreshError}</Alert>}
                    {isSearching && <CircularProgress size={24} />}
                    {!!submittedQuery && !isSearching && !searchError && !mangas.length && (
                        <Typography color="text.secondary">{t`No manga found`}</Typography>
                    )}
                    {!!mangas.length && (
                        <List dense sx={{ maxHeight: 220, overflow: 'auto' }}>
                            {mangas.map((manga) => (
                                <ListItemButton
                                    key={manga.id}
                                    selected={manga.id === mangaId}
                                    onClick={() => handleMangaSelect(manga)}
                                >
                                    <ListItemText primary={manga.title} />
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                    <TextField
                        select
                        fullWidth
                        disabled={!mangaId || isRefreshingManga || chaptersResponse.loading}
                        label={t`Chapter`}
                        value={selection.chapter?.id ?? ''}
                        onChange={(event) => {
                            const chapter = chapters.find((item) => item.id === Number(event.target.value));
                            if (!chapter) {
                                return;
                            }

                            onChange({
                                ...selection,
                                chapter: {
                                    id: chapter.id,
                                    name: chapter.name,
                                    pageCount: chapter.pageCount,
                                    sourceOrder: chapter.sourceOrder,
                                },
                            });
                        }}
                    >
                        {chapters.map((chapter) => (
                            <MenuItem key={chapter.id} value={chapter.id}>
                                {chapter.name}
                            </MenuItem>
                        ))}
                    </TextField>
                    {selection.manga && (
                        <Typography color="text.secondary" variant="body2">
                            {selection.manga.title}
                        </Typography>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};
