# AppButton Click Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Prevent Huawei and other devices from dispatching duplicate `AppButton` actions during one rapid tap sequence.

**Architecture:** Keep the first click synchronous and ignore later clicks inside a configurable interval. Store the last accepted timestamp per component instance; expose a `debounce` prop defaulting to 300 ms and allow `0` to disable the guard.

**Tech Stack:** Vue 3, uni-app, JavaScript, Node.js assertions.

### Task 1: Define click acceptance behavior

**Files:**
- Create: `tests/appButtonClickGuard.test.mjs`
- Create: `utils/clickGuard.js`

1. Test that the first click is accepted, clicks inside 300 ms are rejected, and the boundary click is accepted.
2. Test that interval `0` accepts every click.
3. Run `node tests/appButtonClickGuard.test.mjs` and confirm the test fails before implementation.
4. Add the minimal timestamp comparison helper.
5. Re-run the test and confirm it passes.

### Task 2: Integrate the guard into AppButton

**Files:**
- Modify: `components/AppButton.vue`
- Test: `tests/appButtonClickGuard.test.mjs`

1. Test the component contract: default `debounce` is 300 ms and `handleClick` consults the guard before emitting.
2. Run the test and confirm it fails before integration.
3. Add the prop, per-instance timestamp, and leading-edge guard to `handleClick`.
4. Run the focused test, all Node tests, and the H5 production build.
