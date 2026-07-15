/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PauseCircleFilledIcon from '@mui/icons-material/PauseCircleFilled';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import SettingsIcon from '@mui/icons-material/Settings';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useLingui } from '@lingui/react/macro';
import type {
    ParallelPagePosition,
    ParallelReaderPaneSettings,
} from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { ReaderPageScaleMode, ReadingDirection } from '@/features/reader/Reader.types.ts';
import { AUTO_SCROLL_SPEED, PAGE_GAP } from '@/features/reader/settings/ReaderSettings.constants.tsx';
import { coerceIn } from '@/lib/HelperFunctions.ts';

type ParallelReaderPaneControlsProps = {
    currentPosition: ParallelPagePosition;
    isAutoScrollActive: boolean;
    onAutoScrollActiveChange: (isActive: boolean) => void;
    onGoToPage: (pageIndex: number) => void;
    onSettingsChange: (settings: ParallelReaderPaneSettings) => void;
    pageCount: number;
    readerLabel: string;
    settings: ParallelReaderPaneSettings;
};

export const ParallelReaderPaneControls = ({
    currentPosition,
    isAutoScrollActive,
    onAutoScrollActiveChange,
    onGoToPage,
    onSettingsChange,
    pageCount,
    readerLabel,
    settings,
}: ParallelReaderPaneControlsProps) => {
    const { t } = useLingui();
    const [anchorElement, setAnchorElement] = useState<HTMLButtonElement | null>(null);
    const pageStep = settings.readingDirection === ReadingDirection.RTL ? -1 : 1;
    const previousPage = currentPosition.pageIndex - pageStep;
    const nextPage = currentPosition.pageIndex + pageStep;
    const isOpen = Boolean(anchorElement);
    const pageScaleOptions = [
        { value: ReaderPageScaleMode.WIDTH, label: t`Fit width` },
        { value: ReaderPageScaleMode.HEIGHT, label: t`Fit height` },
        { value: ReaderPageScaleMode.SCREEN, label: t`Fit screen` },
        { value: ReaderPageScaleMode.ORIGINAL, label: t`Original size` },
    ];

    const updateSettings = (update: Partial<ParallelReaderPaneSettings>) =>
        onSettingsChange({ ...settings, ...update });
    const updateAutoScroll = (update: Partial<ParallelReaderPaneSettings['autoScroll']>) =>
        updateSettings({ autoScroll: { ...settings.autoScroll, ...update } });

    const handleAutoScrollSpeedChange = (value: string) => {
        const speed = Number(value);
        if (!Number.isFinite(speed)) {
            return;
        }

        updateAutoScroll({ value: coerceIn(speed, AUTO_SCROLL_SPEED.min, AUTO_SCROLL_SPEED.max) });
    };

    return (
        <>
            <IconButton
                aria-controls={isOpen ? `${readerLabel}-controls` : undefined}
                aria-expanded={isOpen ? 'true' : undefined}
                aria-haspopup="dialog"
                aria-label={t`Configure ${readerLabel}`}
                color={isOpen ? 'primary' : 'default'}
                onClick={(event: MouseEvent<HTMLButtonElement>) => setAnchorElement(event.currentTarget)}
                size="small"
            >
                <SettingsIcon fontSize="small" />
            </IconButton>
            <Popover
                anchorEl={anchorElement}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                id={isOpen ? `${readerLabel}-controls` : undefined}
                onClose={() => setAnchorElement(null)}
                open={isOpen}
                slotProps={{ paper: { sx: { maxWidth: 'calc(100vw - 24px)', width: 360 } } }}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            >
                <Stack spacing={1.5} sx={{ p: 2 }}>
                    <Box>
                        <Typography component="h3" variant="h6">
                            {readerLabel}
                        </Typography>
                        <Typography color="text.secondary" variant="body2">
                            {t`These controls only change this reader.`}
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <IconButton
                            aria-label={t`Previous page`}
                            disabled={previousPage < 0 || previousPage >= pageCount}
                            onClick={() => onGoToPage(previousPage)}
                        >
                            <ChevronLeftIcon />
                        </IconButton>
                        <FormControl fullWidth size="small">
                            <InputLabel id={`${readerLabel}-page-label`}>{t`Page`}</InputLabel>
                            <Select
                                label={t`Page`}
                                labelId={`${readerLabel}-page-label`}
                                onChange={(event) => onGoToPage(Number(event.target.value) - 1)}
                                value={Math.min(currentPosition.pageIndex + 1, Math.max(pageCount, 1))}
                            >
                                {Array.from({ length: pageCount }, (_, pageIndex) => (
                                    <MenuItem key={pageIndex} value={pageIndex + 1}>
                                        {t`Page ${pageIndex + 1}`}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <IconButton
                            aria-label={t`Next page`}
                            disabled={nextPage < 0 || nextPage >= pageCount}
                            onClick={() => onGoToPage(nextPage)}
                        >
                            <ChevronRightIcon />
                        </IconButton>
                    </Stack>
                    <Divider />
                    <Box>
                        <Typography variant="subtitle2">{t`Reading style`}</Typography>
                        <Typography color="text.secondary" variant="caption">
                            {t`Single page keeps one page in view. Continuous scroll keeps the full chapter flowing.`}
                        </Typography>
                    </Box>
                    <ToggleButtonGroup
                        color="primary"
                        exclusive
                        fullWidth
                        onChange={(_event, readingMode: ParallelReaderPaneSettings['readingMode'] | null) => {
                            if (readingMode) {
                                updateSettings({ readingMode });
                            }
                        }}
                        size="small"
                        value={settings.readingMode}
                    >
                        <ToggleButton value="single">{t`Single page`}</ToggleButton>
                        <ToggleButton value="continuous">{t`Continuous`}</ToggleButton>
                    </ToggleButtonGroup>
                    <FormControl fullWidth size="small">
                        <InputLabel id={`${readerLabel}-scale-label`}>{t`Image size`}</InputLabel>
                        <Select
                            label={t`Image size`}
                            labelId={`${readerLabel}-scale-label`}
                            onChange={(event) => updateSettings({ pageScaleMode: Number(event.target.value) })}
                            value={settings.pageScaleMode}
                        >
                            {pageScaleOptions.map(({ value, label }) => (
                                <MenuItem key={value} value={value}>
                                    {label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth size="small">
                        <InputLabel id={`${readerLabel}-direction-label`}>{t`Reading direction`}</InputLabel>
                        <Select
                            label={t`Reading direction`}
                            labelId={`${readerLabel}-direction-label`}
                            onChange={(event) => updateSettings({ readingDirection: Number(event.target.value) })}
                            value={settings.readingDirection}
                        >
                            <MenuItem value={ReadingDirection.LTR}>{t`Left to right`}</MenuItem>
                            <MenuItem value={ReadingDirection.RTL}>{t`Right to left`}</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={settings.shouldStretchPage}
                                onChange={(event) => updateSettings({ shouldStretchPage: event.target.checked })}
                            />
                        }
                        label={t`Stretch smaller pages`}
                    />
                    <TextField
                        label={t`Gap between pages`}
                        onChange={(event) => {
                            const pageGap = Number(event.target.value);
                            if (Number.isFinite(pageGap)) {
                                updateSettings({ pageGap: coerceIn(pageGap, PAGE_GAP.min, PAGE_GAP.max) });
                            }
                        }}
                        size="small"
                        slotProps={{ htmlInput: { max: PAGE_GAP.max, min: PAGE_GAP.min, step: PAGE_GAP.step } }}
                        type="number"
                        value={settings.pageGap}
                    />
                    <Divider />
                    <Box>
                        <Typography variant="subtitle2">{t`Auto scroll`}</Typography>
                        <Typography color="text.secondary" variant="caption">
                            {t`Only one reader auto-scrolls at a time. When the readers are linked, it moves the other reader too.`}
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button
                            color={isAutoScrollActive ? 'secondary' : 'primary'}
                            fullWidth
                            onClick={() => onAutoScrollActiveChange(!isAutoScrollActive)}
                            startIcon={isAutoScrollActive ? <PauseCircleFilledIcon /> : <PlayCircleFilledIcon />}
                            variant="contained"
                        >
                            {isAutoScrollActive ? t`Pause auto scroll` : t`Start auto scroll`}
                        </Button>
                        <TextField
                            label={t`Seconds`}
                            onChange={(event) => handleAutoScrollSpeedChange(event.target.value)}
                            size="small"
                            slotProps={{
                                htmlInput: {
                                    max: AUTO_SCROLL_SPEED.max,
                                    min: AUTO_SCROLL_SPEED.min,
                                    step: AUTO_SCROLL_SPEED.step,
                                },
                            }}
                            type="number"
                            value={settings.autoScroll.value}
                        />
                    </Stack>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={settings.autoScroll.smooth}
                                onChange={(event) => updateAutoScroll({ smooth: event.target.checked })}
                            />
                        }
                        label={t`Smooth auto scrolling`}
                    />
                </Stack>
            </Popover>
        </>
    );
};
