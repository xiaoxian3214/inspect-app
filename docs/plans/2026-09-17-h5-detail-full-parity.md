# H5 Detail Full Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 App 验货详情的清单、疵点、订单信息和本地数据字段及操作完整对齐 H5，并保留手机本地拍照与离线草稿能力。

**Architecture:** 使用 `domain/detailViewModel.uts` 统一普通/合并验货的数据键、视图模型和提交 payload。四个 Tab 只负责展示与发出业务事件，`pages/report/detail.uvue` 负责编辑、拍照、持久化、同步和联网最终提交。

**Tech Stack:** uni-app x、UVue、UTS、Node.js `node:test`、本地 uni storage 数据库。

### Task 1: 固定普通与合并数据契约

**Files:**
- Modify: `tests/detail-view-model.test.mjs`
- Modify: `domain/detailViewModel.uts`

**Steps:**
1. 写普通章节树、合并子行复合键和服务端 ID 的失败测试。
2. 运行 `node --test tests/detail-view-model.test.mjs`，确认测试先失败。
3. 新增带用途注释的键生成、合并行补全、进度和 payload 纯函数。
4. 再次运行测试，确认通过。

### Task 2: 对齐清单 Tab

**Files:**
- Modify: `tests/detail-ui-contract.test.mjs`
- Modify: `components/detail/ChecklistTab.uvue`
- Modify: `pages/report/detail.uvue`

**Steps:**
1. 写 H5 props、合并子行字段和事件的失败契约测试。
2. 重构清单组件，接收 `standardItems`、`inspectionPlanRows`、`checklistData`、`defects` 和校验列表。
3. 实现章节折叠、合并子行展开、结果操作、拍照、疵点和完成入口。
4. 在父页按复合键打开、保存和拍照，并保留所有方法注释。
5. 运行详情 UI 和 view model 测试。

### Task 3: 对齐订单信息 Tab

**Files:**
- Modify: `tests/detail-view-model.test.mjs`
- Modify: `tests/detail-ui-contract.test.mjs`
- Modify: `components/detail/PlanInfoTab.uvue`
- Modify: `domain/detailViewModel.uts`

**Steps:**
1. 写普通完整字段和合并数量汇总的失败测试。
2. 实现公共字段、18 个详情字段、AQL 文案、合并汇总和子计划折叠卡片。
3. 运行相关测试。

### Task 4: 对齐疵点 Tab

**Files:**
- Modify: `tests/detail-view-model.test.mjs`
- Modify: `tests/detail-ui-contract.test.mjs`
- Modify: `components/detail/DefectListTab.uvue`
- Modify: `pages/report/detail.uvue`

**Steps:**
1. 写数量统计、严重等级分组、普遍性疵点和子行关联的失败测试。
2. 新增疵点统计和分组纯函数。
3. 重写疵点卡片并保持新增、编辑、删除二次确认。
4. 让新增疵点继承当前检查项及合并子计划关联。
5. 运行相关测试。

### Task 5: 对齐本地数据 Tab

**Files:**
- Modify: `tests/detail-ui-contract.test.mjs`
- Modify: `components/detail/LocalDataTab.uvue`
- Modify: `pages/report/detail.uvue`

**Steps:**
1. 写原始 JSON、刷新和复制事件的失败测试。
2. 将本地数据 Tab 改为 H5 原始报告 JSON 视图。
3. 从 `reportRepository` 读取当前持久化记录并格式化 JSON。
4. 使用 `uni.setClipboardData` 复制内容并处理失败提示。
5. 运行相关测试。

### Task 6: 完成详情父页编排

**Files:**
- Modify: `pages/report/detail.uvue`
- Modify: `components/detail/CheckItemSheet.uvue`
- Modify: `components/detail/QuickDefectSheet.uvue`

**Steps:**
1. 确认检查项编辑器可接收普通键和合并复合键。
2. 确认疵点编辑器保存 `checkItemResultId` 与 `sonPlanId`。
3. 保留离线草稿与图片队列，并阻止离线最终提交。
4. 运行详情相关测试。

### Task 7: 全量验证

**Files:**
- Verify: `pages/report/detail.uvue`
- Verify: `components/detail/*.uvue`
- Verify: `domain/detailViewModel.uts`

**Steps:**
1. 运行 `npm test`。
2. 对 UVue 脚本执行语法检查。
3. 检查模板标签平衡。
4. 扫描 `window`、`document`、`localStorage`、`indexedDB`、Blob URL 和 SVG。
5. 汇总实际通过数量与剩余限制。

