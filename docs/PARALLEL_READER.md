# Parallel Reader

Parallel Reader is a WebUI-only reading mode for displaying chapters from two independent manga entries side by side. The manga entries may belong to different Suwayomi sources and do not need to share an identifier.

## Current MVP

- Select a source, search for a manga, and select a chapter independently on each side.
- Load both page lists through Suwayomi-Server's existing GraphQL API.
- Render two independent continuous vertical readers.
- Resize the columns with a pointer or the left/right arrow keys.
- Synchronize by matching pages, chapter progress, or exact scroll distance.
- Pause synchronization at any time, reposition either reader, confirm the new alignment, and continue reading from it.
- Align Reader B from Reader A's position or Reader A from Reader B's position, and swap sides.
- Add, edit, delete, reset, and navigate to manual page matches in the advanced page-matching area.
- Add a signed initial page offset.
- Restore selections, page matches, mode calibrations, synchronization settings, column width, and last visible pages from local storage.

OCR, computer vision, and automatic language matching are intentionally outside the MVP.

## Usage

1. Start Suwayomi-Server.
2. Start WebUI with `pnpm dev` and open `http://localhost:3000`.
3. Open **Parallel Reader** from the desktop sidebar or the mobile **More** page.
4. On each side, select a source, enter a search, select a manga, and select a chapter.
5. Select **Open parallel reader**.
6. Choose the synchronization method that best fits the two editions:
    - **Matching pages** keeps corresponding page positions together. It is best when the editions mostly have the same pagination; add page matches where one edition has extra or missing pages.
    - **Chapter progress** keeps the same relative point in both chapters. It is useful when the page counts differ but both editions distribute the content similarly.
    - **Same scroll distance** starts from a scene that you align manually and then applies the same CSS-pixel scroll delta to both readers. It is useful when the content is equivalent but the pages are split differently.
7. Scroll either reader. While synchronization is active, the other reader follows according to the selected method.

### Repositioning and realignment

You can establish a new correspondence at any time and in every synchronization mode:

1. Select **Adjust alignment**. Synchronization pauses so that the readers can move independently.
2. Scroll each side until the same scene crosses the alignment guide.
3. Select **Use these positions** to save the new reference and resume synchronization, or cancel to keep the previous reference.

The confirmation has mode-specific behavior:

- In **Matching pages**, it saves the two current pages as a page match.
- In **Chapter progress**, it saves the current difference between the two chapter percentages.
- In **Same scroll distance**, it calibrates the current scroll positions as the shared starting point. Subsequent movement by _N_ CSS pixels on either side moves the other side by the same _N_ CSS pixels. Repeating the adjustment replaces this calibration.

For a quick one-sided correction, **Align from Reader A** moves Reader B to the position corresponding to Reader A, while **Align from Reader B** moves Reader A to the position corresponding to Reader B. These commands use the active mode and the current calibration.

In **Matching pages**, open the advanced **Page matches** area to inspect or refine the correspondence. **Save current page match** records the pages currently crossing the reading guide; **Starting page difference** applies a signed initial offset; **Go to this match** navigates back to a saved pair; and **Clear all page matches** restores index-based mapping.

A source extension can fail while fetching a manga or its pages. Parallel Reader displays the GraphQL/source error independently for each side and provides a retry action.

## Architecture

The feature is isolated under `src/features/parallel-reader`:

- `components/ParallelChapterSelector.tsx`: source, manga, and chapter selection.
- `components/ParallelReaderPane.tsx`: one vertical page stream using the shared `SpinnerImage` loader.
- `components/ParallelReaderWorkspace.tsx`: two panes, toolbar, resizer, and shared state.
- `components/PageAnchorEditor.tsx`: manual link validation and editing.
- `hooks/useParallelChapterPages.ts`: existing `fetchChapterPages` mutation and source-aware page URLs.
- `hooks/useParallelScrollSync.ts`: requestAnimationFrame-throttled synchronization and loop prevention.
- `utils/PageVisibility.ts`: visible page and progress calculations relative to each scroll container.
- `utils/PageMapping.ts`: DOM-independent anchor interpolation.
- `services/ParallelReaderPersistence.ts`: versioned keys and persisted-data sanitization.
- `services/ParallelReaderCompatibility.ts`: uses the existing Apollo client with stable `fetchManga` and `fetchChapters` fields.

The feature reuses the official `RequestManager`, Apollo cache, GraphQL fragments, `SpinnerImage`, image queue, cancellation, retry behavior, MUI theme, Lingui messages, application routes, and navigation. It does not instantiate two copies of the singleton `ReaderStore`.

## Page-match mapping

Saved page matches are stored as zero-based anchor pairs `(L, R)`. They must contain integer page indices, stay within the two chapter ranges, and increase strictly on both sides.

For adjacent anchors `(L₀, R₀)` and `(L₁, R₁)`, a source page `L` maps to:

```text
R = R₀ + (L - L₀) × (R₁ - R₀) / (L₁ - L₀)
```

The result uses `Math.round` and is clamped to the target chapter. Unequal intervals can therefore map multiple source pages to one target page or skip a target page. Before the first anchor and after the last anchor, mapping preserves the nearest anchor's offset. Without anchors, pages map by index. Mapping works in both directions by inverting the anchor pairs. Progress within the source image is transferred without rounding.

## Persistence

Selections use these versioned keys:

```text
parallel-reader:left-selection:v1
parallel-reader:right-selection:v1
parallel-reader:open:v1
```

Each alignment has an ordered identity:

```text
parallel-reader:alignment:v1:<left-source>:<left-manga>:<left-chapter>::<right-source>:<right-manga>:<right-chapter>
```

Alignment writes are debounced. Restored page indices, progress, width, synchronization mode, page matches, percentage offsets, and the lockstep calibration status are sanitized before use. Raw pixel origins are not persisted because they depend on the viewport; they are rebuilt from the restored logical positions. Local storage is sufficient because the MVP data is small JSON that is needed synchronously on startup. Server-side storage can be considered later for cross-device synchronization.

## Compatibility note

The current WebUI `master` branch contains source and extension fields newer than Suwayomi-Server v2.2.2100. Parallel Reader requests only the stable `SOURCE_BASE_FIELDS` fields for its selector and uses the stable `fetchManga` plus `fetchChapters` mutations when initializing a search result. No Suwayomi-Server files or database schema are modified.

GraphQL-generated files were not edited manually. Regenerating every WebUI operation against v2.2.2100 is not possible because unrelated current-`master` operations reference fields absent from that server. Run `pnpm gql:codegen` after upgrading to a server whose schema matches the checked-out WebUI revision.

## Verification

From the repository root:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm lint
corepack pnpm tsc
corepack pnpm format:check
corepack pnpm build
```

## Maintaining the fork

Review changes before committing:

```powershell
git status --short
git diff
git diff --staged
```

Discard an uncommitted change to one file only after verifying the path:

```powershell
git restore -- path\to\file
```

Create a safe inverse commit for an existing commit:

```powershell
git revert <commit-sha>
```

Update from the official repository without force-pushing:

```powershell
git fetch upstream
git switch master
git merge --ff-only upstream/master
git push origin master
git switch feature/parallel-reader
git merge master
```

If conflicts occur, run `git status`, open each conflicted file, preserve the upstream changes and the isolated `parallel-reader` integration, remove conflict markers, then run the complete verification commands before `git add` and `git commit`. Do not use `git push --force` for this workflow.

## License

New and modified source files retain the project's MPL 2.0 notice. The fork must keep modified MPL-covered source files available as required by the license.
