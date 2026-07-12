/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { UrlUtil } from '@/lib/UrlUtil.ts';
import { addSourceIdToPageUrl } from '@/features/parallel-reader/utils/PageUrls.ts';

export const useParallelChapterPages = (chapterId: number, sourceId: string) => {
    const [fetchPages, response] = requestManager.useGetChapterPagesFetch(chapterId);

    const refetch = useCallback(
        () =>
            fetchPages({ variables: { input: { chapterId } } }).catch(() => {
                // The mutation result exposes the error to the component.
            }),
        [chapterId, fetchPages],
    );

    useEffect(() => {
        refetch();

        return () => response.abortRequest(new Error('Parallel chapter pages request was cancelled'));
    }, [chapterId, sourceId]);

    const pages = useMemo(
        () =>
            (response.data?.fetchChapterPages?.pages ?? []).map((page) => {
                const absolutePageUrl = UrlUtil.asUrl(page)?.toString() ?? requestManager.getValidImgUrlFor(page);

                return addSourceIdToPageUrl(absolutePageUrl, sourceId);
            }),
        [response.data?.fetchChapterPages?.pages, sourceId],
    );

    return {
        error: response.error,
        loading: response.loading,
        pages,
        refetch,
    };
};
