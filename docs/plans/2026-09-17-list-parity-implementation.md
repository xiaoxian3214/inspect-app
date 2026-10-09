# App 首页与 H5 列表对齐 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复云同步循环并将 App 首页图标、浮动菜单和卡片操作对齐 H5。

**Architecture:** 页面编排本地优先列表与同步状态；纯 ViewModel 计算操作可见性；通用图标和底部菜单由组件渲染。详情侧继续复用 App 离线仓储与下载服务。

**Tech Stack:** uni-app X、UTS、UVue、Node.js test runner。

### Task 1: 列表操作纯函数

**Files:**
- Create: `domain/listActionViewModel.uts`
- Create: `tests/list-action-view-model.test.mjs`

**Steps:**
1. 为 FAB 操作、下载状态、卡片操作和同步请求条件编写失败测试。
2. 运行 `node --test tests/list-action-view-model.test.mjs` 确认失败。
3. 实现最小纯函数并为每个方法添加注释。
4. 再次运行测试确认通过。

### Task 2: 通用图标与底部菜单

**Files:**
- Create: `components/icons/AppIcon.uvue`
- Create: `components/common/BottomActionSheet.uvue`

**Steps:**
1. 实现 App 原生可用的图标结构，不依赖浏览器 SVG DOM。
2. 实现 H5 风格遮罩、圆角底部菜单、标题、操作项和取消项。
3. 为组件内每个方法添加注释。

### Task 3: 云同步入口

**Files:**
- Modify: `components/sync/OfflineSyncStatus.uvue`
- Modify: `pages/report/list.uvue`

**Steps:**
1. 将组件事件改为 `sync-request`，点击时只展开状态卡并请求一次同步。
2. 页面新增防重入、联网检查、待同步复核和 `finally` 状态清理。
3. 移除云图标与远程列表刷新的错误绑定。
4. 保留手动下拉刷新列表能力。

### Task 4: FAB 与卡片操作

**Files:**
- Modify: `pages/report/list.uvue`
- Modify: `components/inspection/InspectionPlanCard.uvue`

**Steps:**
1. 使用通用图标和底部菜单替换字符图标与重复菜单结构。
2. 按 H5 页签生成 FAB 操作。
3. 按 H5 下载、锁定、合并和状态条件生成卡片操作。
4. 已实现操作接入现有 Service/Repository，未实现操作显示明确提示。
5. 为所有新增或修改方法添加方法注释。

### Task 5: 验证

**Files:**
- Modify: `AGENTS.md`

**Steps:**
1. 运行 `npm test`。
2. 检查页面和组件不存在未注释的方法。
3. 检查云图标不再调用 `refreshList`。
4. 检查右下角菜单和卡片菜单文本、顺序与 H5 一致。
