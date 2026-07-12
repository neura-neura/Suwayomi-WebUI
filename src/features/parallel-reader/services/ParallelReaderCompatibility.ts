/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ChapterReaderFieldsFragment, MangaBaseFieldsFragment } from '@/lib/graphql/generated/graphql.ts';
import { FETCH_PARALLEL_READER_MANGA } from '@/lib/graphql/manga/MangaMutation.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';

type FetchParallelReaderMangaMutation = {
    fetchChapters: {
        chapters: ChapterReaderFieldsFragment[];
    };
    fetchManga: {
        manga: MangaBaseFieldsFragment;
    };
};

type FetchParallelReaderMangaVariables = {
    mangaId: number;
};

export const fetchParallelReaderManga = (mangaId: number) =>
    requestManager.graphQLClient.client.mutate<FetchParallelReaderMangaMutation, FetchParallelReaderMangaVariables>({
        mutation: FETCH_PARALLEL_READER_MANGA,
        variables: { mangaId },
    });
