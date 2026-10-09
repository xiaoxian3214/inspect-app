# Photo Upload State And Sync Details Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent uploaded photos from returning to the pending queue and show H5-style synchronization details when the cloud icon is tapped.

**Architecture:** Keep the photo table as the source of truth for upload lifecycle fields. When a report snapshot is saved, merge the latest persisted upload result into matching incoming photos before replacing the photo rows. Extend the existing shared queue overview with display-ready upload, delete, and draft-save entries, then pass those entries into the reusable cloud status component on list and detail pages.

**Tech Stack:** uni-app x, Vue 3, UTS, Node test runner.

### Task 1: Reproduce uploaded-state regression

**Files:**
- Modify: `tests/report-detail-storage.test.mjs`
- Modify: `repositories/reportRepository.uts`

1. Save a pending photo in a report snapshot.
2. Mark the photo uploaded through `photoRepository`.
3. Save the stale pending report snapshot again.
4. Verify the photo remains uploaded and is excluded from the pending queue.
5. Preserve persisted upload fields while saving matching report photos.

### Task 2: Build synchronization queue details

**Files:**
- Modify: `tests/sync-queue-overview-service.test.mjs`
- Modify: `services/syncQueueOverviewService.uts`

1. Assert the overview returns ordered upload, delete, and save entries.
2. Include plan labels, owner labels, retry status, and failure messages.
3. Keep `finishFlag=1` excluded through the existing pending-plan policy.

### Task 3: Render shared cloud details

**Files:**
- Create: `tests/sync-status-ui.test.mjs`
- Modify: `components/sync/OfflineSyncStatus.uvue`
- Modify: `components/detail/InspectionDetailHeader.uvue`
- Modify: `pages/report/list.uvue`
- Modify: `pages/report/detail.uvue`

1. Pass queue items from both pages into the shared component.
2. Render the queue count and each operation's type, content, metadata, and failure state.
3. Keep the cloud tap informational; automatic synchronization remains owned by existing lifecycle triggers.

### Task 4: Verify behavior

**Files:**
- Test: `tests/report-detail-storage.test.mjs`
- Test: `tests/sync-queue-overview-service.test.mjs`
- Test: `tests/sync-status-ui.test.mjs`

1. Run the focused tests and verify they pass.
2. Run `npm test`.
3. Confirm the changed App code does not use DOM, SVG, or browser-only APIs.
