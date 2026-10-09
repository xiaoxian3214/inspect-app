# Final Submission Online Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure final inspection submission only runs while online and after every local photo has uploaded successfully, while preserving offline draft editing and synchronization.

**Architecture:** Keep draft synchronization and final submission as two separate workflows. Draft payloads with `finishFlag=0` may be retried automatically, but final payloads with `finishFlag=1` are handled by a dedicated submission service that checks network state, drains the media upload queue, rechecks photo status, and then calls the report API directly.

**Tech Stack:** uni-app x, UTS, Vue 3, `uni.getNetworkType`, `uni.uploadFile`, Node test runner.

### Task 1: Lock automatic synchronization to drafts

**Files:**
- Modify: `services/offlineSyncService.uts`
- Test: `tests/offline-sync-service.test.mjs`

1. Add a failing test proving `finishFlag=1` payloads are excluded from `syncPendingPlans()`.
2. Add a pure final-payload detector that accepts numeric, string, and nested finish flags.
3. Make `isPlanPendingSync()` reject final payloads before calling `generateReport()`.
4. Run `node --test tests/offline-sync-service.test.mjs` and confirm the suite passes.

### Task 2: Add final submission policy

**Files:**
- Create: `domain/finalSubmissionPolicy.uts`
- Test: `tests/final-submission-policy.test.mjs`

1. Add failing tests for offline state, pending photos, failed photos, and fully uploaded photos.
2. Normalize photo status across `done`, `success`, `uploaded`, and server `fileId` forms.
3. Return a stable blocking reason and count for UI display.
4. Run the focused policy test.

### Task 3: Add guarded final submission service

**Files:**
- Create: `services/inspectionSubmissionService.uts`
- Modify: `runtime/appRuntime.uts`
- Test: `tests/inspection-submission-service.test.mjs`

1. Add failing tests proving offline submission never uploads or calls `generateReport()`.
2. Add failing tests proving pending media is uploaded and rechecked before submission.
3. Add failing tests proving remaining failed media blocks submission.
4. Submit directly with `finishFlag=1`; never enqueue the final request.
5. Export the service from the runtime for the detail page.

### Task 4: Integrate the migrated detail page

**Files:**
- Modify: `pages/report/detail.uvue`
- Create or modify: `components/detail/FinishInspectionSheet.uvue`

1. Keep H5 validation for incomplete checklist items, failed-item photos, overall result, and remarks.
2. Save the latest draft locally before opening the final confirmation.
3. Call the guarded service only after the user confirms.
4. Display offline and unfinished-upload reasons without creating a final queue task.
5. Mark the local plan and merged siblings reported only after the server confirms the reported state.

### Task 5: Verify queue boundaries

**Files:**
- Test: `tests/offline-sync-service.test.mjs`
- Test: `tests/inspection-submission-service.test.mjs`

1. Run focused tests for draft synchronization and final submission.
2. Run `npm test`.
3. Confirm no final payload is stored in `request_queue` or `pendingSyncPayload` for automatic execution.
4. Confirm offline edits and local photo paths remain available after restart.
