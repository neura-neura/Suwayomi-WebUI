/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ParallelPagePosition } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { coerceIn } from '@/lib/HelperFunctions.ts';

export const PAGE_READING_POINT_RATIO = 0.35;

export const getVisiblePagePosition = (
    scrollElement: HTMLElement,
    pageElements: (HTMLElement | null)[],
): ParallelPagePosition | undefined => {
    const scrollBounds = scrollElement.getBoundingClientRect();
    const readingPoint = scrollBounds.top + scrollElement.clientHeight * PAGE_READING_POINT_RATIO;
    const availablePages = pageElements
        .map((element, pageIndex) => ({ element, pageIndex }))
        .filter((page): page is { element: HTMLElement; pageIndex: number } => page.element !== null);

    if (!availablePages.length) {
        return undefined;
    }

    const visiblePage =
        availablePages.find(({ element }) => {
            const bounds = element.getBoundingClientRect();
            return bounds.top <= readingPoint && bounds.bottom > readingPoint;
        }) ?? availablePages.find(({ element }) => element.getBoundingClientRect().bottom > readingPoint);
    const finalPage = visiblePage ?? availablePages[availablePages.length - 1];
    const pageBounds = finalPage.element.getBoundingClientRect();
    const progress = pageBounds.height ? coerceIn((readingPoint - pageBounds.top) / pageBounds.height, 0, 1) : 0;

    return { pageIndex: finalPage.pageIndex, progress };
};

export const scrollToPagePosition = (
    scrollElement: HTMLElement,
    pageElements: (HTMLElement | null)[],
    position: ParallelPagePosition,
): void => {
    const pageElement = pageElements[position.pageIndex];
    if (!pageElement) {
        return;
    }

    const scrollBounds = scrollElement.getBoundingClientRect();
    const pageBounds = pageElement.getBoundingClientRect();
    const readingPoint = scrollBounds.top + scrollElement.clientHeight * PAGE_READING_POINT_RATIO;
    const pagePoint = pageBounds.top + pageBounds.height * coerceIn(position.progress, 0, 1);

    scrollElement.scrollTo({ top: scrollElement.scrollTop + pagePoint - readingPoint });
};
