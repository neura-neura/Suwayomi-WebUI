/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { addSourceIdToPageUrl } from '@/features/parallel-reader/utils/PageUrls.ts';

test('adds the source id to a server page URL', () => {
    assert.equal(
        addSourceIdToPageUrl('http://localhost:4567/api/v1/manga/97/chapter/1/page/0', 'source-1'),
        'http://localhost:4567/api/v1/manga/97/chapter/1/page/0?sourceId=source-1',
    );
});

test('preserves existing page URL parameters', () => {
    assert.equal(
        addSourceIdToPageUrl('https://cdn.example/page.jpg?token=abc', 'source 2'),
        'https://cdn.example/page.jpg?token=abc&sourceId=source+2',
    );
});
