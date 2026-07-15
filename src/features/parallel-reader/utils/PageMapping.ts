/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { PageAnchor, ParallelPagePosition } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { coerceIn } from '@/lib/HelperFunctions.ts';

export type PageMappingDirection = 'left-to-right' | 'right-to-left';

const sortAnchors = (anchors: PageAnchor[]): PageAnchor[] =>
    anchors.toSorted((first, second) => first.leftPage - second.leftPage);

export const validatePageAnchors = (anchors: PageAnchor[], leftPageCount: number, rightPageCount: number): string[] => {
    const errors: string[] = [];
    const sortedAnchors = sortAnchors(anchors);

    sortedAnchors.forEach((anchor, index) => {
        if (!Number.isInteger(anchor.leftPage) || !Number.isInteger(anchor.rightPage)) {
            errors.push('page-index-not-integer');
        }
        if (anchor.leftPage < 0 || anchor.leftPage >= leftPageCount) {
            errors.push('left-page-out-of-range');
        }
        if (anchor.rightPage < 0 || anchor.rightPage >= rightPageCount) {
            errors.push('right-page-out-of-range');
        }

        const previousAnchor = sortedAnchors[index - 1];
        if (
            previousAnchor &&
            (anchor.leftPage <= previousAnchor.leftPage || anchor.rightPage <= previousAnchor.rightPage)
        ) {
            errors.push('anchors-not-strictly-increasing');
        }
    });

    return [...new Set(errors)];
};

export const upsertPageAnchor = (anchors: PageAnchor[], anchor: PageAnchor): PageAnchor[] =>
    sortAnchors([...anchors.filter((item) => item.leftPage !== anchor.leftPage), anchor]);

const getDirectionalAnchors = (anchors: PageAnchor[], direction: PageMappingDirection): PageAnchor[] =>
    direction === 'left-to-right'
        ? sortAnchors(anchors)
        : sortAnchors(anchors.map(({ leftPage, rightPage }) => ({ leftPage: rightPage, rightPage: leftPage })));

export const mapPageIndex = (
    sourcePage: number,
    anchors: PageAnchor[],
    direction: PageMappingDirection,
    targetPageCount: number,
): number => {
    if (targetPageCount <= 0) {
        return 0;
    }

    const directionalAnchors = getDirectionalAnchors(anchors, direction);
    if (!directionalAnchors.length) {
        return coerceIn(Math.round(sourcePage), 0, targetPageCount - 1);
    }

    const [firstAnchor] = directionalAnchors;
    const lastAnchor = directionalAnchors[directionalAnchors.length - 1];
    let mappedPage: number;

    if (sourcePage <= firstAnchor.leftPage) {
        mappedPage = sourcePage + firstAnchor.rightPage - firstAnchor.leftPage;
    } else if (sourcePage >= lastAnchor.leftPage) {
        mappedPage = sourcePage + lastAnchor.rightPage - lastAnchor.leftPage;
    } else {
        const upperAnchorIndex = directionalAnchors.findIndex((anchor) => anchor.leftPage >= sourcePage);
        const lowerAnchor = directionalAnchors[upperAnchorIndex - 1];
        const upperAnchor = directionalAnchors[upperAnchorIndex];
        const sourceInterval = upperAnchor.leftPage - lowerAnchor.leftPage;
        const targetInterval = upperAnchor.rightPage - lowerAnchor.rightPage;
        const intervalProgress = (sourcePage - lowerAnchor.leftPage) / sourceInterval;

        mappedPage = lowerAnchor.rightPage + intervalProgress * targetInterval;
    }

    return coerceIn(Math.round(mappedPage), 0, targetPageCount - 1);
};

export const mapPagePosition = (
    position: ParallelPagePosition,
    anchors: PageAnchor[],
    direction: PageMappingDirection,
    targetPageCount: number,
): ParallelPagePosition => ({
    pageIndex: mapPageIndex(position.pageIndex, anchors, direction, targetPageCount),
    progress: coerceIn(position.progress, 0, 1),
});

const getPositionCoordinate = ({ pageIndex, progress }: ParallelPagePosition): number =>
    pageIndex + coerceIn(progress, 0, 1);

const getPositionFromCoordinate = (coordinate: number, pageCount: number): ParallelPagePosition => {
    if (pageCount <= 0) {
        return { pageIndex: 0, progress: 0 };
    }

    const boundedCoordinate = coerceIn(coordinate, 0, pageCount);
    if (boundedCoordinate === pageCount) {
        return { pageIndex: pageCount - 1, progress: 1 };
    }

    const pageIndex = Math.floor(boundedCoordinate);
    return { pageIndex, progress: coerceIn(boundedCoordinate - pageIndex, 0, 1) };
};

const interpolateCoordinate = (
    value: number,
    sourceStart: number,
    sourceEnd: number,
    targetStart: number,
    targetEnd: number,
): number => {
    if (sourceEnd === sourceStart) {
        return targetEnd;
    }

    return targetStart + ((value - sourceStart) / (sourceEnd - sourceStart)) * (targetEnd - targetStart);
};

/**
 * Maps page-content coordinates using two matching scenes. The range between
 * the markers is interpolated independently from the parts before and after
 * it, so differing image dimensions do not alter the amount of content moved.
 */
export const mapPositionBetweenMarkers = (
    sourcePosition: ParallelPagePosition,
    sourceStart: ParallelPagePosition,
    sourceEnd: ParallelPagePosition,
    targetStart: ParallelPagePosition,
    targetEnd: ParallelPagePosition,
    sourcePageCount: number,
    targetPageCount: number,
): ParallelPagePosition => {
    const sourceCoordinate = getPositionCoordinate(sourcePosition);
    const sourceStartCoordinate = getPositionCoordinate(sourceStart);
    const sourceEndCoordinate = getPositionCoordinate(sourceEnd);
    const targetStartCoordinate = getPositionCoordinate(targetStart);
    const targetEndCoordinate = getPositionCoordinate(targetEnd);
    const sourceMaximum = Math.max(0, sourcePageCount);
    const targetMaximum = Math.max(0, targetPageCount);
    let targetCoordinate: number;

    if (sourceCoordinate <= sourceStartCoordinate) {
        targetCoordinate = interpolateCoordinate(sourceCoordinate, 0, sourceStartCoordinate, 0, targetStartCoordinate);
    } else if (sourceCoordinate <= sourceEndCoordinate) {
        targetCoordinate = interpolateCoordinate(
            sourceCoordinate,
            sourceStartCoordinate,
            sourceEndCoordinate,
            targetStartCoordinate,
            targetEndCoordinate,
        );
    } else {
        targetCoordinate = interpolateCoordinate(
            sourceCoordinate,
            sourceEndCoordinate,
            sourceMaximum,
            targetEndCoordinate,
            targetMaximum,
        );
    }

    return getPositionFromCoordinate(targetCoordinate, targetPageCount);
};
