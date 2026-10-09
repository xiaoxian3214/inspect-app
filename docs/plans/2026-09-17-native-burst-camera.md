# Native Burst Camera Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace one-shot system image selection with a reusable H5-aligned media grid and an Android/iOS custom continuous-shooting camera page.

**Architecture:** Detail sheets render media through shared media item and grid components. The grid opens a dedicated native camera route, which keeps the camera preview active while accumulating persisted local photos and returns all confirmed paths through a request-scoped event. Existing offline media persistence then writes each path into the photo table and upload queue.

**Tech Stack:** uni-app x, Vue UTS, `camera`, `CameraContext`, SQLite photo queue, Node test runner.

### Task 1: Define Camera Result Contracts

**Files:**
- Create: `domain/cameraCapture.uts`
- Create: `tests/camera-capture.test.mjs`

1. Normalize returned camera paths.
2. Deduplicate continuous captures.
3. Enforce the maximum capture count.
4. Generate isolated request event names.

### Task 2: Componentize the Media Library

**Files:**
- Create: `components/detail/InspectionMediaItem.uvue`
- Create: `components/detail/InspectionMediaGrid.uvue`
- Modify: `components/detail/CheckItemSheet.uvue`
- Modify: `components/detail/QuickDefectSheet.uvue`

1. Match H5 thumbnail, status, retry, preview and delete behavior.
2. Reuse the grid in checklist and defect editors.
3. Keep all business events semantic.

### Task 3: Build the Native Burst Camera

**Files:**
- Create: `pages/report/camera.uvue`
- Modify: `pages.json`
- Modify: `manifest.json`

1. Render the native camera preview.
2. Keep preview active after every shot.
3. Persist each captured or selected image locally.
4. Support delete, lens switch and flash modes.
5. Return all confirmed local paths to the caller.

### Task 4: Connect Detail Offline Media

**Files:**
- Modify: `pages/report/detail.uvue`

1. Open the custom camera with a request ID.
2. Consume all returned paths.
3. Save each image through the existing offline photo service.
4. Preserve existing upload metadata and automatic synchronization.

### Task 5: Verify Both Platforms

1. Run camera and detail contract tests.
2. Run the complete `npm test` suite.
3. Rebuild the Android/iOS custom base with camera and media modules.
