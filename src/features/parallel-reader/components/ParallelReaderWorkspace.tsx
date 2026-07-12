/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useLingui } from '@lingui/react/macro';
import type { ParallelReaderSideSelection } from '@/features/parallel-reader/types/ParallelReader.types.ts';
import { ParallelReaderPane } from '@/features/parallel-reader/components/ParallelReaderPane.tsx';
import { coerceIn } from '@/lib/HelperFunctions.ts';
import { useParallelScrollSync } from '@/features/parallel-reader/hooks/useParallelScrollSync.ts';

type ParallelReaderWorkspaceProps = {
    leftSelection: Required<ParallelReaderSideSelection>;
    rightSelection: Required<ParallelReaderSideSelection>;
    onClose: () => void;
    onSwap: () => void;
};

export const ParallelReaderWorkspace = ({
    leftSelection,
    rightSelection,
    onClose,
    onSwap,
}: ParallelReaderWorkspaceProps) => {
    const { t } = useLingui();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const leftScrollRef = useRef<HTMLDivElement | null>(null);
    const rightScrollRef = useRef<HTMLDivElement | null>(null);
    const [leftWidth, setLeftWidth] = useState(50);
    const [isResizing, setIsResizing] = useState(false);
    const [isSyncEnabled, setIsSyncEnabled] = useState(true);
    const { onLeftScroll, onRightScroll, recenter } = useParallelScrollSync(
        leftScrollRef,
        rightScrollRef,
        isSyncEnabled,
    );

    const resize = useCallback((clientX: number) => {
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) {
            return;
        }

        setLeftWidth(coerceIn(((clientX - bounds.left) / bounds.width) * 100, 25, 75));
    }, []);

    useEffect(() => {
        if (!isResizing) {
            return () => {};
        }

        const handlePointerMove = (event: globalThis.PointerEvent) => resize(event.clientX);
        const stopResizing = () => setIsResizing(false);

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', stopResizing, { once: true });

        return () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', stopResizing);
        };
    }, [isResizing, resize]);

    const handleResizeStart = (event: PointerEvent) => {
        event.preventDefault();
        setIsResizing(true);
        resize(event.clientX);
    };

    const handleResizeKeyDown = (event: KeyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            return;
        }

        event.preventDefault();
        setLeftWidth((width) => coerceIn(width + (event.key === 'ArrowLeft' ? -2 : 2), 25, 75));
    };

    return (
        <Stack spacing={1} sx={{ height: 'calc(100dvh - 80px)', minHeight: 480, p: 1 }}>
            <Stack direction="row" spacing={1}>
                <Button onClick={onClose} startIcon={<ArrowBackIcon />}>
                    {t`Change chapters`}
                </Button>
                <FormControlLabel
                    control={
                        <Switch checked={isSyncEnabled} onChange={(event) => setIsSyncEnabled(event.target.checked)} />
                    }
                    label={t`Synchronize scrolling`}
                />
                <Button onClick={recenter} startIcon={<CenterFocusStrongIcon />}>
                    {t`Recenter`}
                </Button>
                <Button onClick={onSwap} startIcon={<CompareArrowsIcon />}>
                    {t`Swap sides`}
                </Button>
            </Stack>
            <Box sx={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
                <Box
                    ref={containerRef}
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `${leftWidth}fr 8px ${100 - leftWidth}fr`,
                        height: '100%',
                        minWidth: 720,
                    }}
                >
                    <ParallelReaderPane onScroll={onLeftScroll} scrollRef={leftScrollRef} selection={leftSelection} />
                    <Box
                        role="separator"
                        aria-label={t`Resize reader columns`}
                        aria-orientation="vertical"
                        aria-valuemax={75}
                        aria-valuemin={25}
                        aria-valuenow={Math.round(leftWidth)}
                        onKeyDown={handleResizeKeyDown}
                        onPointerDown={handleResizeStart}
                        tabIndex={0}
                        sx={{
                            cursor: 'col-resize',
                            bgcolor: isResizing ? 'primary.main' : 'divider',
                            outlineOffset: -2,
                            touchAction: 'none',
                        }}
                    />
                    <ParallelReaderPane
                        onScroll={onRightScroll}
                        scrollRef={rightScrollRef}
                        selection={rightSelection}
                    />
                </Box>
            </Box>
        </Stack>
    );
};
