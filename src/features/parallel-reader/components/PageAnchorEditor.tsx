/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LinkIcon from '@mui/icons-material/Link';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
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
        <Accordion disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 'medium' }}>{t`Page matches (${anchors.length})`}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ maxHeight: 300, overflow: 'auto', pt: 0 }}>
                <Typography color="text.secondary" sx={{ mb: 1.5 }} variant="body2">
                    {t`Use page matches when one edition has extra or missing pages. Each match marks pages that show the same content.`}
                </Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'center' } }}>
                    <Button onClick={linkCurrentPages} startIcon={<LinkIcon />} variant="contained">
                        {t`Save current page match`}
                    </Button>
                    <TextField
                        label={t`Starting page difference`}
                        onChange={(event) => setInitialOffset(Number(event.target.value))}
                        size="small"
                        type="number"
                        value={initialOffset}
                        slotProps={{ htmlInput: { step: 1 } }}
                    />
                    <Button onClick={setOffsetAnchor}>{t`Apply`}</Button>
                    <Button color="error" disabled={!anchors.length} onClick={() => updateAnchors([])}>
                        {t`Clear all page matches`}
                    </Button>
                </Stack>
                {validationError && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                        {t`Page matches must be in range and increase on both sides.`}
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
                                        {t`Go to this match`}
                                    </Button>
                                    <IconButton
                                        aria-label={t`Delete page match`}
                                        onClick={() =>
                                            updateAnchors(anchors.filter((_, itemIndex) => itemIndex !== index))
                                        }
                                        size="small"
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </AccordionDetails>
        </Accordion>
    );
};
