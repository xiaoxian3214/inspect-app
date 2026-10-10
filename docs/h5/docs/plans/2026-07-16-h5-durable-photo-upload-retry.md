# H5 Durable Photo Upload Retry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** 让 H5 图片在弱网下无需手动操作即可持续退避重试，并在页面重新进入后从 IndexedDB 自动续传，同时避免单张失败阻塞整条队列。

**Architecture:** 继续以照片记录作为持久化队列项，将 `pending`、`uploading`、`retry_wait`、`done`、`needs_attention` 状态及 `nextRetryAt` 写入本地计划。上传执行器只领取当前可执行任务；临时失败进入冷却并允许后续任务继续，页面根据最近重试时间设置单个调度定时器。IndexedDB 读取使用三态结果区分“找到”“确认不存在”“暂时不可用”，只有确认不存在且没有其他本地源时才进入永久错误。

**Tech Stack:** Vue 3、uni-app、IndexedDB、XMLHttpRequest、Node.js test runner。

### Task 1: 退避策略与可执行任务判定

**Files:**
- Modify: `utils/photoUpload.js`
- Test: `tests/photoUploadQueueBehavior.test.mjs`

1. 写失败测试，约束退避间隔为 2 秒、5 秒、15 秒、30 秒、1 分钟、2 分钟，之后每 5 分钟。
2. 写失败测试，验证 `retry_wait` 在 `nextRetryAt` 前不可领取、到期后可领取。
3. 运行 `node --test tests/photoUploadQueueBehavior.test.mjs`，确认因策略函数缺失而失败。
4. 实现纯函数 `getPhotoUploadRetryDelay`、`isPhotoUploadRetryReady` 和最近重试时间查询。
5. 重跑测试并确认通过。

### Task 2: 临时失败冷却且不阻塞后续图片

**Files:**
- Modify: `utils/photoUpload.js`
- Modify: `api/report.js`
- Test: `tests/photoUploadQueueBehavior.test.mjs`

1. 写失败测试，模拟第一张临时网络失败、第二张成功，验证第一张进入 `retry_wait`，第二张仍会上传。
2. 写失败测试，验证 HTTP 5xx、断网、无进度属于临时错误，明确的 400/413/415/422 属于永久错误。
3. 运行专项测试并确认失败原因符合预期。
4. 为上传错误附加 HTTP 状态，增加错误分类；临时错误持久化 `nextRetryAt`，永久错误进入 `needs_attention`。
5. 移除临时失败触发的全局暂停，仅保留当前固定波次隔离。
6. 重跑专项测试并确认通过。

### Task 3: 页面内自动调度与重新进入续传

**Files:**
- Modify: `pages/report/detail.vue`
- Test: `tests/networkAwareUpload.test.mjs`

1. 写失败测试，验证页面使用单一重试定时器，并监听 `online`、`visibilitychange`、`pageshow` 恢复队列。
2. 写失败测试，验证退出页面时清理调度定时器，并把未完成上传恢复为可续传状态。
3. 运行测试并确认失败。
4. 实现最近 `nextRetryAt` 调度；页面加载、回到前台、网络恢复时立即扫描队列。
5. 临时失败只展示“等待自动上传/弱网重试”状态，不弹出失败 Toast；永久错误才提示处理。
6. 重跑测试并确认通过。

### Task 4: 区分 IndexedDB 暂时不可用与原图确实缺失

**Files:**
- Modify: `utils/photoBlobStore.js`
- Modify: `utils/photoUpload.js`
- Modify: `pages/report/detail.vue`
- Test: `tests/photoUploadQueueBehavior.test.mjs`

1. 写失败测试，验证读取异常返回 `unavailable`，而不是 `missing`。
2. 写失败测试，验证首次查无记录后重开数据库复查，只有再次查无才返回 `missing`。
3. 写失败测试，验证 `unavailable` 进入自动冷却，确认 `missing` 且无其他来源才进入 `needs_attention`。
4. 实现带状态的 Blob 读取和连接重置；保留兼容的 `getBlob()` 接口供预览使用。
5. 替换“读取失败即图片失效”的判断逻辑。
6. 重跑专项测试并确认通过。

### Task 5: 验证

**Files:**
- Test: `tests/networkAwareUpload.test.mjs`
- Test: `tests/photoUploadQueueBehavior.test.mjs`
- Test: `tests/photoUploadRetryAndBlocking.test.mjs`
- Test: `tests/photoUploadStateMerge.test.mjs`

1. 运行上传专项测试，确认全部通过。
2. 运行 `node --test tests/*.test.mjs`，记录任何既有无关失败。
3. 运行 `npm run build:h5`。
4. 运行 `git diff --check` 并审查最终差异。

### Task 6: 图片与视频队列独立推进

**Files:**
- Modify: `utils/photoUpload.js`
- Modify: `pages/report/detail.vue`
- Modify: `pages/report/components/MediaGrid.vue`
- Test: `tests/photoUploadQueueBehavior.test.mjs`

1. 写失败测试，验证慢视频仍在上传时，后续多个图片波次已经全部完成。
2. 为图片和视频建立独立运行 Promise、独立重入标记和媒体类型过滤。
3. 图片继续使用网络自适应 1/2/4 并发，视频保持单并发。
4. 补充 `retry_wait` 和 `needs_attention` 状态展示。
5. 验证拍照导致的保存操作不会覆盖两条队列的实时状态和 `nextRetryAt`。
