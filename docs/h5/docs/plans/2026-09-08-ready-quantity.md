# Ready Quantity Implementation Plan

**Goal:** 列表与结束验货使用同一备货数量编辑器，合并验货逐项修改并汇总。

**Architecture:** 共用数量工具负责单据识别、合并明细、汇总、校验及缓存更新。弹框复用 `updateFinishQuantity`，每条记录使用自己的计划 ID；保存失败保留输入，已成功记录同步缓存，避免覆盖验货内容。

**Tech Stack:** Vue 3、uni-app、Node assert 测试。

### Task 1: 数量模型回归测试
- 新增 `tests/readyQuantity.test.mjs`，覆盖非合并只读自身、合并去重汇总、零值、非法输入、分页、逐项 API 和部分失败。
- 运行 `node tests/readyQuantity.test.mjs`，确认先失败后通过。

### Task 2: 共用编辑与持久化
- 新增 `pages/report/utils/readyQuantity.js` 和 `pages/report/components/ReadyQuantityPopup.vue`。
- 按计划 ID 显示产品/订单信息、原始订单数量和可编辑的新备货数量。
- 在线读取最新数据，合并明细缺失时分页查询，禁止将读取失败误当作单项。
- 仅更新数量字段及相关合并快照，保留本地检查项、照片和同步状态。

### Task 3: 页面接入
- `PlanListItemCard.vue` 在复制合并菜单之后接入编辑器。
- `detail.vue` 结束弹框按明细汇总并接入同一编辑器，保留离线摘要能力。
- 补充英文、越南文文案。

### Task 4: 验证
- 运行全部 `tests/*.test.mjs`，使用 Vue SFC 编译器检查修改组件。
- 执行 H5 构建并检查 `git diff --check`，不提交或创建分支。
