# Search Page H5 Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 App 搜索页实现与 H5 一致的搜索筛选、下载、合并、拆分、解锁和复制流程，并保留本地离线数据覆盖与落库能力。

**Architecture:** 使用纯函数 ViewModel 统一搜索和操作规则，使用 Operation Service 编排远程接口、本地清理与下载，页面仅管理交互状态。筛选及操作弹层组件化，卡片通过语义化事件通知页面。

**Tech Stack:** uni-app X、UVue、UTS、Node.js `node:test`、本地 uniStorage 数据库。

### Task 1: 搜索领域规则

**Files:**
- Create: `tests/search-view-model.test.mjs`
- Create: `domain/searchViewModel.uts`

1. 为搜索参数、日期边界、本地覆盖、合并资格和结果去重编写失败测试。
2. 运行目标测试并确认因函数缺失失败。
3. 实现最小纯函数并为每个函数添加用途注释。
4. 运行目标测试并确认通过。

### Task 2: 计划操作接口

**Files:**
- Modify: `tests/api-client.test.mjs`
- Modify: `api/planApi.uts`

1. 为字典、模板、合并、拆分、复制和解锁请求编写失败测试。
2. 运行目标测试并确认请求契约不完整导致失败。
3. 实现 H5 同源接口和返回值归一化。
4. 运行目标测试并确认通过。

### Task 3: 本地仓库与操作服务

**Files:**
- Modify: `repositories/reportRepository.uts`
- Create: `tests/plan-operation-service.test.mjs`
- Create: `services/planOperationService.uts`
- Modify: `runtime/appRuntime.uts`

1. 为远程操作委托、复制参数校验和解锁后本地清理编写失败测试。
2. 运行目标测试并确认 Service 缺失导致失败。
3. 增加批量删除仓库能力并实现 Operation Service。
4. 注册运行时 Service，运行目标测试并确认通过。

### Task 4: 可复用操作组件

**Files:**
- Create: `components/search/SearchFilterSheet.uvue`
- Create: `components/search/MergePlanSheet.uvue`
- Create: `components/search/SplitPlanSheet.uvue`
- Create: `components/search/CopyPlanSheet.uvue`

1. 建立筛选、合并、拆分、复制弹层的统一视觉结构。
2. 所有交互通过语义化事件输出，不在组件内调用业务接口。
3. 为新增和修改的方法添加方法注释。

### Task 5: 卡片事件与搜索页编排

**Files:**
- Modify: `components/inspection/InspectionPlanCard.uvue`
- Modify: `pages/report/search.uvue`
- Create: `tests/search-ui-contract.test.mjs`

1. 先写页面契约失败测试，覆盖业务事件、日期筛选和组件接线。
2. 卡片把解锁、复制、复制合并和拆分改为语义化事件。
3. 搜索页接入字典、模板、操作 Service 和四类弹层。
4. 每次下载或远程操作完成后刷新本地记录并覆盖当前结果。
5. 运行页面契约测试并确认通过。

### Task 6: 完整验证

**Files:**
- Verify: `pages/report/search.uvue`
- Verify: `components/search/*.uvue`

1. 运行 `npm test`。
2. 解析所有新增 UVue 单文件组件，确认模板与脚本结构有效。
3. 检查无 H5 DOM、SVG 或浏览器专属 API。
4. 记录 HBuilderX 真机编译受当前 Qt/CPU 环境限制，交由用户本机验证。

