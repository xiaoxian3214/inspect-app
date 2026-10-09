# Photo Sort Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add H5-aligned checklist photo sorting that works offline on Android and iOS.

**Architecture:** A pure UTS domain helper owns immutable reordering and `sortNo` normalization. A reusable native bottom sheet edits a temporary order, while the check-item editor and detail page publish and persist the confirmed result through the existing draft queue.

**Tech Stack:** uni-app x, UVue, UTS, Node.js `node:test`.

### Task 1: Define photo ordering behavior

**Files:**
- Create: `tests/media-sort.test.mjs`
- Create: `domain/mediaSort.uts`

1. Write failing tests for forward and backward moves.
2. Verify invalid indexes preserve order and normalize `sortNo`.
3. Implement the smallest immutable reorder helpers.
4. Run the focused domain tests.

### Task 2: Build the reusable sorting sheet

**Files:**
- Create: `components/detail/PhotoSortSheet.uvue`
- Modify: `tests/detail-ui-contract.test.mjs`

1. Write failing UI contract assertions.
2. Render a native three-column image grid and selection state.
3. Move the selected image when a destination is tapped.
4. Emit semantic `sorted` and `close` events.

### Task 3: Persist checklist photo order

**Files:**
- Modify: `components/detail/CheckItemSheet.uvue`
- Modify: `pages/report/detail.uvue`
- Modify: `tests/detail-ui-contract.test.mjs`

1. Expose sorting when the current item has multiple photos.
2. Emit `photos-sorted` with the current item and ordered photos.
3. Update the normal or merged checklist data key.
4. Reuse the existing delayed offline draft save.

### Task 4: Verify native compatibility

1. Run focused sorting and detail contract tests.
2. Run `npm test`.
3. Scan changed App files for browser-only APIs.
