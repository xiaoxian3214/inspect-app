# Login, List, and Offline Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first usable uni-app X milestone with login, local-first inspection lists, plan search/download, SQLite persistence, and reusable offline synchronization.

**Architecture:** Pages call services, services route every HTTP request through a single runtime queue, and repositories own all database access. Retryable write/download work is additionally stored in SQLite so it can resume after connectivity or process loss.

**Tech Stack:** uni-app X, UTS, UVue, Android SQLite, iOS SQLite, Node test runner

**Repository note:** The current project directory is not a Git repository, so commit steps are intentionally omitted. Do not initialize or commit without user approval.

### Task 1: Test Harness and Plan View Model

**Files:**
- Create: `package.json`
- Create: `tests/load-uts-module.mjs`
- Create: `tests/plan-view-model.test.mjs`
- Create: `domain/planViewModel.uts`

**Steps:**
1. Add tests for status normalization, identity selection, local-first merging, grouping, and download-result splitting.
2. Run `npm test -- tests/plan-view-model.test.mjs` and confirm failure because the module is missing.
3. Implement the smallest pure UTS module that satisfies the tests.
4. Run the focused test and confirm it passes.

### Task 2: Serial API Request Queue

**Files:**
- Create: `tests/api-request-queue.test.mjs`
- Create: `core/queue/apiRequestQueue.uts`

**Steps:**
1. Add tests for priority, serial execution, deduplication, and continuation after failure.
2. Run the focused test and confirm failure.
3. Implement `createApiRequestQueue` with a single active task and stable priority ordering.
4. Run the focused test and confirm it passes.

### Task 3: Database Contract and Schema

**Files:**
- Create: `tests/database-schema.test.mjs`
- Create: `database/schema.uts`
- Create: `database/database.uts`
- Create: `database/memoryDatabase.uts`

**Steps:**
1. Add tests for required tables, schema version, transaction rollback, and report upsert behavior.
2. Run the focused test and confirm failure.
3. Implement the schema contract and testable in-memory adapter.
4. Run the focused test and confirm it passes.

### Task 4: Native SQLite Adapter

**Files:**
- Create: `uni_modules/qcm-sqlite/utssdk/interface.uts`
- Create: `uni_modules/qcm-sqlite/utssdk/app-android/index.uts`
- Create: `uni_modules/qcm-sqlite/utssdk/app-ios/index.uts`
- Create: `database/sqliteDatabase.uts`

**Steps:**
1. Define open, execute, query, transaction, close, and migration APIs.
2. Implement parameterized Android SQLite calls.
3. Implement parameterized iOS SQLite calls.
4. Wire `database/database.uts` to the native adapter on App builds.
5. Verify on Android and iOS devices through HBuilderX.

### Task 5: Repositories and Session Service

**Files:**
- Create: `tests/auth-service.test.mjs`
- Create: `repositories/userRepository.uts`
- Create: `repositories/reportRepository.uts`
- Create: `repositories/requestQueueRepository.uts`
- Create: `services/authService.uts`

**Steps:**
1. Add failing tests for login normalization, session restore, logout, and offline-session fallback.
2. Implement repositories against the database contract.
3. Implement auth service against an injected API client.
4. Run focused tests.

### Task 6: API Client and Backend Endpoints

**Files:**
- Create: `config/appConfig.uts`
- Create: `api/apiClient.uts`
- Create: `api/authApi.uts`
- Create: `api/planApi.uts`

**Steps:**
1. Add failing tests for URL construction, language, bearer token, response unwrapping, and error normalization.
2. Implement all HTTP calls through `ApiRequestQueue`.
3. Match H5 login, search, pending-count, and download endpoint contracts.
4. Run focused tests.

### Task 7: Login and Startup Routing

**Files:**
- Create: `pages/login/login.uvue`
- Create: `services/appBootstrapService.uts`
- Modify: `App.uvue`
- Modify: `pages.json`

**Steps:**
1. Add login form validation tests where logic is pure.
2. Implement database initialization and session routing.
3. Implement login, loading, error, remember-user, and logout behavior.
4. Verify navigation with and without a local session.

### Task 8: Reusable List Card and Local-First List

**Files:**
- Create: `components/inspection/InspectionPlanCard.uvue`
- Create: `pages/report/list.uvue`
- Create: `services/planListService.uts`
- Modify: `pages.json`

**Steps:**
1. Add failing service tests for local-first load and remote/local merge.
2. Implement the standalone list card and emitted actions.
3. Implement three status tabs, grouping, paging, empty/loading/error states, and local reload in `onShow`.
4. Add the fixed bottom “查询验货” button.

### Task 9: Search and Download-to-Local Flow

**Files:**
- Create: `tests/plan-download-service.test.mjs`
- Create: `pages/report/search.uvue`
- Create: `services/planDownloadService.uts`

**Steps:**
1. Add failing tests for download deduplication, split result normalization, transactional save, and failure rollback.
2. Implement query form, paging, result cards, and checklist selection boundary.
3. Route downloads through the API queue and save results transactionally.
4. Return to the list and confirm the downloaded item appears from SQLite.

### Task 10: Reusable Offline Sync

**Files:**
- Create: `tests/offline-sync-service.test.mjs`
- Create: `services/offlineSyncService.uts`
- Create: `composables/useOfflineSync.uts`
- Create: `components/sync/OfflineSyncStatus.uvue`

**Steps:**
1. Add failing tests for pending count, completed-report exclusion, merged-child exclusion, retry, and failure continuation.
2. Implement the synchronization state machine and persisted task execution.
3. Implement reusable UI and lifecycle subscription.
4. Mount the component on the list page.

### Task 11: App Configuration and Verification

**Files:**
- Modify: `manifest.json`
- Modify: `platformConfig.json`
- Modify: `uni.scss`

**Steps:**
1. Enable both Android and iOS targets and required network configuration.
2. Run `npm test` and confirm all Node tests pass.
3. Compile Android and iOS in HBuilderX.
4. Verify online login, offline relaunch, search, download, process restart, and network-recovery synchronization.
