/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useLingui } from '@lingui/react/macro';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';

export const ParallelReader = () => {
    const { t } = useLingui();

    useAppTitle(t`Parallel Reader`);

    return (
        <Box sx={{ display: 'grid', minHeight: '100%', placeItems: 'center', p: 2 }}>
            <Typography color="text.secondary">{t`Choose two chapters to start reading in parallel.`}</Typography>
        </Box>
    );
};
