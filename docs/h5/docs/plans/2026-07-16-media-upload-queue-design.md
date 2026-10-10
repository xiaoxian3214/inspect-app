# Media Upload Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** 让大量连续拍摄的图片可靠排队上传，避免当前上传卡顿时后拍图片抢占连接并集体失败，同时避免页面关闭导致本地文件失效。

**Architecture:** 保留现有照片记录和 `checklistData` 数据结构，图片按 `createdAt` 全局 FIFO 分波上传：弱网每波 1 张、4G 每波 2 张、健康网络每波最多 4 张；一波启动后新拍图片只进入下一波，不能插入当前波抢占连接。临时失败进入持久化冷却并自动退避重试，不阻塞其他媒体；图片队列与视频队列独立推进，慢视频不能阻塞后续图片。每个媒体源必须先持久化成功才生成 pending 记录；上传成功状态持久化完成后才清理本地 Blob。

**Tech Stack:** Vue 3、uni-app、IndexedDB、Node.js test runner。

### Task 1: 自适应图片波次与失败背压

**Files:**
- Modify: `utils/photoUpload.js`
- Test: `tests/photoUploadQueueBehavior.test.mjs`

1. 写行为测试，验证网络自适应并发、波次启动后不吸纳新图片，以及失败任务冷却后其他任务继续。
2. 运行测试并确认因调度函数缺失而失败。
3. 实现固定波次、全局 FIFO 和失败暂停信号，并接入 `processPendingUploads` 与页面重试/网络恢复逻辑。
4. 运行测试并确认通过。

### Task 2: 缩短失败任务占用时间

**Files:**
- Modify: `api/report.js`
- Modify: `utils/photoUpload.js`
- Test: `tests/photoUploadQueueBehavior.test.mjs`

1. 写测试约束 30 秒请求超时和一次自动重试。
2. 确认测试失败。
3. 修改超时和重试常量。
4. 确认测试通过。

### Task 3: 保证本地源和上传状态的提交顺序

**Files:**
- Modify: `utils/photoUpload.js`
- Modify: `pages/report/detail.vue`
- Test: `tests/photoUploadQueueBehavior.test.mjs`

1. 写测试验证持久化失败不会返回 pending 记录，以及成功状态保存后才清理 Blob。
2. 确认测试失败。
3. 串行化计划保存，并调整 Blob 清理顺序。
4. 确认测试通过。

### Task 4: 保护拍照回调期间的弹窗上下文

**Files:**
- Modify: `pages/report/components/MediaGrid.vue`
- Modify: `pages/report/components/CheckItemModal.vue`
- Modify: `pages/report/detail.vue`
- Test: `tests/photoUploadQueueBehavior.test.mjs`

1. 写测试约束拍照忙碌事件和延迟关闭行为。
2. 确认测试失败。
3. 增加 capture-start/capture-end 事件及关闭延迟。
4. 运行专项测试和全量测试。
