/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import type { PageAnchor, ParallelPagePosition } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { upsertPageAnchor, validatePageAnchors } from '@/features/parallel-reader/utils/PageMapping.ts';

type PageAnchorEditorProps = {
    anchors: PageAnchor[];
    leftPageCount: number;
    leftPosition: ParallelPagePosition;
    rightPageCount: number;
    rightPosition: ParallelPagePosition;
    onChange: (anchors: PageAnchor[]) => void;
    onGoTo: (anchor: PageAnchor) => void;
};

export const PageAnchorEditor = ({
    anchors,
    leftPageCount,
    leftPosition,
    rightPageCount,
    rightPosition,
    onChange,
    onGoTo,
}: PageAnchorEditorProps) => {
    const { t } = useLingui();
    const [initialOffset, setInitialOffset] = useState(0);
    const [validationError, setValidationError] = useState(false);

    const updateAnchors = (nextAnchors: PageAnchor[]) => {
        const errors = validatePageAnchors(nextAnchors, leftPageCount, rightPageCount);
        if (errors.length) {
            setValidationError(true);
            return;
        }

        setValidationError(false);
        onChange(nextAnchors);
    };

    const linkCurrentPages = () =>
        updateAnchors(
            upsertPageAnchor(anchors, {
                leftPage: leftPosition.pageIndex,
                rightPage: rightPosition.pageIndex,
            }),
        );

    const setOffsetAnchor = () => {
        const anchor =
            initialOffset >= 0
                ? { leftPage: 0, rightPage: initialOffset }
                : { leftPage: Math.abs(initialOffset), rightPage: 0 };
        updateAnchors(upsertPageAnchor(anchors, anchor));
    };

    const editAnchor = (index: number, anchor: PageAnchor) =>
        updateAnchors(
            upsertPageAnchor(
                anchors.filter((_, anchorIndex) => anchorIndex !== index),
                anchor,
            ),
        );

    return (
        <Paper variant="outlined" sx={{ maxHeight: 240, overflow: 'auto', p: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'center' } }}>
                <Button onClick={linkCurrentPages} startIcon={<LinkIcon />} variant="contained">
                    {t`Link current pages`}
                </Button>
                <TextField
                    label={t`Initial page offset`}
                    onChange={(event) => setInitialOffset(Number(event.target.value))}
                    size="small"
                    type="number"
                    value={initialOffset}
                    slotProps={{ htmlInput: { step: 1 } }}
                />
                <Button onClick={setOffsetAnchor}>{t`Add offset`}</Button>
                <Button color="error" disabled={!anchors.length} onClick={() => updateAnchors([])}>
                    {t`Reset links`}
                </Button>
            </Stack>
            {validationError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                    {t`Page links must be in range and increase on both sides.`}
                </Alert>
            )}
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t`Left page`}</TableCell>
                        <TableCell>{t`Right page`}</TableCell>
                        <TableCell>{t`Actions`}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {anchors.map((anchor, index) => (
                        <TableRow key={`${anchor.leftPage}-${anchor.rightPage}`}>
                            <TableCell>
                                <TextField
                                    onChange={(event) =>
                                        editAnchor(index, {
                                            ...anchor,
                                            leftPage: Number(event.target.value) - 1,
                                        })
                                    }
                                    size="small"
                                    type="number"
                                    value={anchor.leftPage + 1}
                                    slotProps={{ htmlInput: { min: 1, max: leftPageCount, step: 1 } }}
                                />
                            </TableCell>
                            <TableCell>
                                <TextField
                                    onChange={(event) =>
                                        editAnchor(index, {
                                            ...anchor,
                                            rightPage: Number(event.target.value) - 1,
                                        })
                                    }
                                    size="small"
                                    type="number"
                                    value={anchor.rightPage + 1}
                                    slotProps={{ htmlInput: { min: 1, max: rightPageCount, step: 1 } }}
                                />
                            </TableCell>
                            <TableCell>
                                <Button onClick={() => onGoTo(anchor)} size="small">
                                    {t`Go`}
                                </Button>
                                <IconButton
                                    aria-label={t`Delete page link`}
                                    onClick={() => updateAnchors(anchors.filter((_, itemIndex) => itemIndex !== index))}
                                    size="small"
                                >
                                    <DeleteIcon />
                                </IconButton>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Paper>
    );
};
