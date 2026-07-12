/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export const addSourceIdToPageUrl = (pageUrl: string, sourceId: string): string => {
    const url = new URL(pageUrl);

    url.searchParams.set('sourceId', sourceId);

    return url.toString();
};
