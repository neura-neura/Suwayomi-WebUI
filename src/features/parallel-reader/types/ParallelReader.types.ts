/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export type ParallelReaderSourceSelection = {
    id: string;
    displayName: string;
};

export type ParallelReaderMangaSelection = {
    id: number;
    sourceId: string;
    title: string;
};

export type ParallelReaderChapterSelection = {
    id: number;
    name: string;
    pageCount: number;
    sourceOrder: number;
};

export type ParallelReaderSideSelection = {
    source?: ParallelReaderSourceSelection;
    manga?: ParallelReaderMangaSelection;
    chapter?: ParallelReaderChapterSelection;
};

export type ParallelPagePosition = {
    pageIndex: number;
    progress: number;
};
