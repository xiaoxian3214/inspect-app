# H5 验货详情完整对齐设计

## 目标

以 `qcm-inspection-app/pages/report/detail.vue` 及其四个详情 Tab 组件为唯一业务基准，在 App 中保留 H5 原有字段、普通验货与合并验货操作，同时把照片来源替换为手机本地文件，并继续遵守“草稿可离线、最终提交必须联网且图片全部上传成功”的规则。

## 数据模型

- `standardItems` 保留 H5 的章节树结构，不再只把扁平 `checklistItems` 作为清单渲染输入。
- 普通检查项的本地编辑键为 `itemId`。
- 合并验货子计划的本地编辑键为 `itemId__sonPlanId`。
- 合并验货子计划提交到服务端的 `itemResult.id` 为 `itemId_sonPlanId`。
- `inspectionPlans` 是合并验货子行和订单信息子卡片的数据源；`plan.mergeType === 2` 或存在多条计划时进入合并展示。
- `checklistData` 保存结果、备注、测量值、文本值、条码值和图片；`defects` 保存疵点及其 `checkItemId`、`checkItemResultId`、`sonPlanId` 关联。

## 组件职责

- `ChecklistTab.uvue`：按章节渲染主行；合并验货时展开每个 `inspectionPlans` 子行；主行和子行都支持结果、图片、备注、疵点和编辑事件。
- `DefectListTab.uvue`：显示 H5 同款严重等级统计、按等级分组、实际影响数量、首图、编码、描述、数量和时间。
- `PlanInfoTab.uvue`：普通模式显示 H5 全部订单字段；合并模式显示公共字段、数量汇总表和每个子计划的折叠详情。
- `LocalDataTab.uvue`：显示当前报告持久化原始 JSON、更新时间，并提供刷新和复制。
- `detail.uvue`：只负责编排详情状态、弹层、拍照、草稿持久化、上传和最终提交，不在页面内复制 Tab 视觉结构。

## 交互与离线策略

- 点击普通主行使用 `itemId` 打开检查项编辑器。
- 点击合并子行使用 `itemId__sonPlanId` 打开同一编辑器，保存时继续写回该复合键。
- 拍照先调用系统相机或相册，将临时路径保存为持久本地路径，再进入照片上传队列。
- 疵点新增可绑定普通主行或合并子行；子行疵点同时保存 `checkItemResultId=itemId_sonPlanId` 和 `sonPlanId`。
- 草稿变化写入本地报告快照，并生成 `finishFlag=0` 的同步 payload。
- 最终提交不进入离线队列；必须联网、等待当前报告所有图片上传完成，再发送 `finishFlag=1`。

## 错误处理

- 本地详情不完整且联网时重新请求 H5 通用详情接口；离线时明确提示需要联网下载，不覆盖现有草稿。
- 合并子计划缺少服务端 itemResult 时，在本地按 H5 规则补出可编辑行。
- 图片待上传、上传失败或需要人工处理时禁止最终提交。
- 本地 JSON 刷新失败、复制失败、拍照失败和草稿保存失败均显示明确提示，但不清空当前页面数据。

## 验证范围

- 纯函数测试覆盖普通/合并键、合并 itemResult、payload、订单汇总和疵点分组。
- UI 契约测试覆盖四个 Tab 的 H5 props、字段、事件和安全区结构。
- 运行全量 `npm test`，并扫描 DOM、IndexedDB、Blob URL、SVG 等 H5 专属依赖。

