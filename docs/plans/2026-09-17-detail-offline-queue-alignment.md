# Detail Offline Queue Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make detail-page edits persist locally first and synchronize through the existing shared queues without requiring an immediate network request.

**Architecture:** Keep report edits in the normal dirty-draft queue, media uploads in the photo queue, and uploaded-file deletions in the persistent request queue. The cloud icon only displays the shared queue state; automatic synchronization remains owned by app launch, foreground resume, network recovery, and successful local draft persistence. Final submission remains an explicit online-only action.

**Tech Stack:** uni-app x, Vue UTS, SQLite repositories, Node test runner.

### Task 1: Lock H5-Compatible Offline Behavior

**Files:**
- Modify: `tests/detail-view-model.test.mjs`
- Modify: `tests/detail-ui-contract.test.mjs`

1. Add failing tests for quantity fields in normal draft payloads.
2. Add failing tests for local checklist and photo copying.
3. Add failing tests preventing direct copy and quantity API calls.
4. Add a failing cloud-icon display-only contract test.

### Task 2: Add Local Detail Operations

**Files:**
- Modify: `domain/detailViewModel.uts`

1. Add target checklist-key resolution.
2. Add safe local photo cloning with unique IDs.
3. Add checklist field and photo copy helpers.
4. Add finish and sample quantity update helpers.
5. Include both quantities in `finishFlag=0` payloads.

### Task 3: Use Local-First Detail Flows

**Files:**
- Modify: `pages/report/detail.uvue`

1. Copy checklist data into target local reports.
2. Copy uploaded photos into local target items.
3. Save finish and sample quantities locally first.
4. Let successful draft persistence request automatic synchronization.
5. Keep final submission online-only.

### Task 4: Make Cloud Icon Display-Only

**Files:**
- Modify: `components/sync/OfflineSyncStatus.uvue`
- Modify: `components/detail/InspectionDetailHeader.uvue`
- Modify: `pages/report/list.uvue`
- Modify: `pages/report/detail.uvue`

1. Remove synchronization emission from cloud clicks.
2. Keep queue status expansion and auto-hide behavior.
3. Update text to describe automatic synchronization.
4. Preserve manual synchronization only in explicit action menus.

### Task 5: Verify Persistence and Synchronization

**Files:**
- Test: `tests/detail-view-model.test.mjs`
- Test: `tests/detail-ui-contract.test.mjs`
- Test: `tests/automatic-sync-service.test.mjs`
- Test: `tests/persistent-operation-service.test.mjs`

1. Run focused detail and queue tests.
2. Run the complete `npm test` suite.
3. Confirm no H5 DOM, SVG, or browser storage APIs were introduced.
