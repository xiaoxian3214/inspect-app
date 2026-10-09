# H5 API Parity and Inspection Detail Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完整整理 H5 验货列表、搜索、卡片操作和验货详情页使用的接口，并分阶段迁移为支持离线拍照、离线编辑、断点恢复和同步提交的 App 详情页。

**Architecture:** 页面只负责状态编排和导航，接口调用集中在 API，跨接口流程集中在 Service，可测试数据转换集中在 ViewModel。详情页坚持“本地优先”：打开页面先读取本地完整报告，所有检查项、缺陷和照片先写本地，再由同步服务上传；联网数据只用于首次下载、补全和最终提交。

**Tech Stack:** uni-app X、UVue、UTS、uniStorage 本地数据库、`uni.chooseImage`/相机、`uni.uploadFile` 或统一上传 Service、Node.js 关键回归测试。

**Implementation Status (2026-09-17):** 列表、搜索、下载和详情页核心迁移已完成；详情支持本地优先编辑、三级疵点分类、离线照片持久化、断点上传、持久删除队列、复制检查项、批量移动图片和强制在线最终提交。报告 PDF、服务端文件专用预览接口和评论仍不属于移动离线验货核心范围。

## 一、H5 接口总表

### 认证与用户

| 功能 | 方法与路径 | App 状态 |
| --- | --- | --- |
| 登录 | `POST /api/auth/login` | 已实现 |
| 生成供应商邀请 | `POST /api/invite/generate` | 已实现 |

### 计划、搜索与卡片操作

| 功能 | 方法与路径 | App 状态 |
| --- | --- | --- |
| 搜索计划 | `POST /api/plans/search?current={page}&size={size}` | 已实现 |
| 待验货数量 | `GET /api/plans/pending-count` | 已实现 |
| 下载空报告 | `POST /api/reports/generate/empty/{planId}?templateId={templateId}` | 已实现；已兼容 `inspectionPlans` |
| 计划详情 | `GET /api/reports/plan/{planId}/detail` | 已实现，详情页本地缺失时在线补全 |
| 报告详情 | `GET /api/reports/{reportId}/detail` | 已实现 |
| 合并计划 | `POST /api/plans/merge` | 已实现 |
| 拆分计划 | `POST /api/plans/split/{planId}` | 已实现 |
| 复制当前/合并验货 | `POST /api/plans/{planId}/copy`，查询参数含 `inspectType`、`copyFlag`、`templateId`、`templateName`、`id` | 已实现 |
| 清单模板 | `GET /api/plans/templates` | 已实现 |
| 验货类型字典 | `GET /api/dict/data/code/inspect_type` | 已实现 |
| 复制检查项 | `POST /api/plans/copy-items` | 已实现，详情更多操作已接入 |
| 批量复制照片 | `POST /api/plans/copy-photos-to-items` | 已实现，详情更多操作已接入 |
| 设置备货/完工数量 | `POST /api/plans/{planId}/finish-quantity?finishQuantity={quantity}` | 已实现，卡片操作已接入 |
| 设置抽样数量 | `POST /api/plans/{planId}/sample-quantity?sampleQuantity={quantity}` | 已实现，详情更多操作已接入 |
| 按数量拆分船期 | `POST /api/plans/{planId}/split-by-quantity?quantity={quantity}` | 已实现 API，列表/搜索操作复用 |
| 解锁任务 | `POST /api/reports/generate/release/{planId}?reportDeleteFlag=0` | 已实现 |
| 重置任务 | `POST /api/reports/generate/release/{planId}?reportDeleteFlag=1` | 已实现 |

### 报告、文件与提交

| 功能 | 方法与路径 | App 状态 |
| --- | --- | --- |
| 上传检查文件 | `POST /api/inspect/file/upload` | 已实现 `uni.uploadFile`，同计划上传去重并串行回填 `fileId` |
| 生成/提交报告 | `POST /api/reports/generate` | 已实现；普通草稿可同步，`finishFlag=1` 仅允许用户在线主动提交 |
| 删除文件 | `POST /api/inspect/file/delete/{fileId}` | 已实现持久删除队列，联网后重试 |
| 文件排序 | `POST /api/inspect/file/sort` | API 已实现，详情首期保留原排序 |
| 文件移动 | `POST /api/inspect/file/move` | 已实现，详情批量移动图片已接入 |
| 文件预览 | `GET /api/inspect/file/{fileId}/preview` | 未单独接入；详情优先使用本地路径和服务端文件路径预览 |
| 报告 PDF | `GET /api/reports/{reportId}/pdf` | 未接入，非离线验货核心范围 |

### 缺陷与报告互动

| 功能 | 方法与路径 | App 状态 |
| --- | --- | --- |
| 缺陷三级分类树 | `GET /api/defect-tier-config/tree` | 已实现；联网刷新、离线缓存、三级选择和最近使用 |
| 缺陷等级字典 | `GET /api/dict/data/code/defect_level` | 已实现；与分类树分别刷新，单接口失败不覆盖有效缓存 |
| 报告评论 | `/api/reports/comments` 相关查询、新增、回复和删除接口 | PC 报告页功能，移动离线验货首期不迁移 |

## 二、下载数据为空根因与修复

H5 下载接口返回的主要计划数组字段是 `inspectionPlans`，App 原实现只读取 `plans` 或 `plan`。接口即使成功返回完整数据，`splitDownloadDataToLocalPlans()` 仍会返回空数组，最终抛出“下载数据为空”。

修复后的兼容顺序：

1. 优先读取 `inspectionPlans`。
2. 兼容历史字段 `plans`。
3. 兼容单计划字段 `plan`。
4. 兼容单报告字段 `report`。
5. 下载弹层必须先选择 `GET /api/plans/templates` 返回的清单，再调用下载接口。

## 三、详情页目标结构

### 页面和组件

- Create: `pages/report/detail.uvue`
- Create: `components/detail/InspectionDetailHeader.uvue`
- Create: `components/detail/ChecklistTab.uvue`
- Create: `components/detail/DefectListTab.uvue`
- Create: `components/detail/PlanInfoTab.uvue`
- Create: `components/detail/LocalDataTab.uvue`
- Create: `components/detail/CheckItemSheet.uvue`
- Create: `components/detail/QuickDefectSheet.uvue`
- Create: `components/detail/DefectCategorySheet.uvue`
- Create: `components/detail/PhotoEditorSheet.uvue`
- Reuse: `components/inspection/ReadyQuantitySheet.uvue`
- Create: `components/detail/CopyCheckItemsSheet.uvue`
- Create: `components/detail/BatchMoveMediaSheet.uvue`
- Create: `components/detail/FinishInspectionSheet.uvue`

所有页面顶部使用 `TopSafeArea`。所有新增或修改的方法、函数和计算属性前必须添加用途注释。

### Domain 与 Service

- Create: `domain/detailViewModel.uts`
  - 构建检查项树和扁平列表。
  - 生成 `checklistData` 复合键。
  - 计算检查进度、缺陷数量和未完成项。
  - 合并合并验货子计划检查项。
  - 构造最终 `generateReport` 请求体。
- Create: `services/inspectionDetailService.uts`
  - 本地优先加载详情。
  - 远程详情补全和本地覆盖。
  - 自动保存检查项、文本结论和缺陷。
  - 完成验货前校验和状态更新。
- Create: `services/inspectionMediaService.uts`
  - 拍照/相册选择后立即保存本地文件路径。
  - 生成待上传记录，支持失败重试和断点恢复。
  - 上传完成后写入远程 `fileId`。
  - 删除、排序和批量移动照片。
- Create: `services/defectCatalogService.uts`
  - 联网刷新缺陷树和等级字典。
  - 离线读取最近一次缓存。

### Repository

- Create: `repositories/checklistRepository.uts`
- Create: `repositories/defectRepository.uts`
- Create: `repositories/photoRepository.uts`
- Modify: `repositories/reportRepository.uts`

数据库已有 `checklist`、`defect`、`photo` 表，需补 Repository 和事务接口。一次检查项保存应在同一事务中写入检查结果、缺陷和照片引用，避免 App 被杀后数据不一致。

## 四、详情页数据流程

1. 卡片点击已下载计划，导航到 `/pages/report/detail?planId={id}`。
2. 页面先从 `reportRepository` 读取完整本地报告并立即渲染。
3. 若本地不存在且在线，调用计划详情接口并保存本地；离线且无本地数据时显示明确空状态。
4. 检查项选择通过/失败/不适用后立即事务保存，不等待离开页面。
5. 拍照后先保存本地路径和 `pending` 上传状态，页面立刻可见；联网时后台串行或受控并发上传。
6. 新增缺陷时先写本地；缺陷分类树优先读缓存，联网后异步刷新。
7. 页面隐藏、退出、系统中断时刷新本地快照，不强制等待网络。
8. 点击完成验货时校验未完成检查项、失败项照片、待上传文件和缺陷信息。
9. 在线且上传完成后调用 `POST /api/reports/generate`；`finishFlag=1` 的最终提交禁止离线保存到自动同步队列，离线时只保留草稿并提示用户联网后重新主动提交。
10. 提交成功后把当前计划及同一合并组计划状态更新为报告状态。

## 五、实施任务

### Task 1: 详情接口与字典

**Files:**
- Modify: `api/planApi.uts`
- Create: `api/reportFileApi.uts`
- Create: `api/defectApi.uts`

实现计划详情、报告详情、复制检查项、复制照片、抽样数量、按数量拆分、文件上传/删除/排序/移动、缺陷树和缺陷等级接口。备货/完工数量接口已经完成，详情页直接复用。只为关键请求路径和响应归一化补测试。

### Task 2: 离线详情仓库

**Files:**
- Create: `repositories/checklistRepository.uts`
- Create: `repositories/defectRepository.uts`
- Create: `repositories/photoRepository.uts`
- Modify: `repositories/reportRepository.uts`

实现按 `planId` 查询、事务保存、删除和待上传队列。验证 App 重启后仍能恢复检查项、缺陷和照片。

### Task 3: 详情 ViewModel 与 Service

**Files:**
- Create: `domain/detailViewModel.uts`
- Create: `services/inspectionDetailService.uts`
- Create: `services/inspectionMediaService.uts`
- Create: `services/defectCatalogService.uts`
- Modify: `runtime/appRuntime.uts`

迁移 H5 的检查项键、进度、缺陷统计、合并计划映射和报告请求体逻辑。不要迁移 IndexedDB、Blob URL、DOM 或浏览器剪贴板实现。

### Task 4: 详情基础页面

**Files:**
- Create: `pages/report/detail.uvue`
- Create: `components/detail/InspectionDetailHeader.uvue`
- Create: `components/detail/ChecklistTab.uvue`
- Create: `components/detail/DefectListTab.uvue`
- Create: `components/detail/PlanInfoTab.uvue`
- Modify: `pages.json`

先实现安全区、四个 Tab、检查项结果、本地自动保存和返回恢复。卡片点击从摘要弹层改为详情页导航。

### Task 5: 拍照与缺陷

**Files:**
- Create: `components/detail/CheckItemSheet.uvue`
- Create: `components/detail/QuickDefectSheet.uvue`
- Create: `components/detail/DefectCategorySheet.uvue`
- Create: `components/detail/PhotoEditorSheet.uvue`

接入相机、相册、本地预览、删除、重试上传、缺陷三级分类和缺陷等级。照片必须先本地可见，再上传。

### Task 6: 高级操作与完成验货

**Files:**
- Reuse: `components/inspection/ReadyQuantitySheet.uvue`
- Create: `components/detail/CopyCheckItemsSheet.uvue`
- Create: `components/detail/BatchMoveMediaSheet.uvue`
- Create: `components/detail/FinishInspectionSheet.uvue`

实现备货数量、复制检查项、批量移动照片、强制完成确认，以及“联网且全部图片上传成功后才允许最终提交”的门禁。

### Task 7: 关键验证

1. 下载普通计划和合并计划，确认 `inspectionPlans` 全部落库。
2. 断网进入详情并编辑检查项、缺陷和照片，杀掉 App 后重新打开确认恢复。
3. 恢复网络后确认照片和普通草稿同步不重复执行，且最终提交不会自动执行。
4. 验证安全区覆盖登录、首页、列表、搜索和详情页。
5. 运行 `npm test` 和 UVue 模板解析；真机验证相机、文件权限和后台恢复。
