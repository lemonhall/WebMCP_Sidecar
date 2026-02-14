# ECN-0004: 重复注入导致 Content Script 报错（幂等化修复）

## 基本信息

- **ECN 编号**：ECN-0004
- **关联 PRD**：PRD-0001 / PRD-0002
- **关联 Req ID**：REQ-0001-002、REQ-0001-009、REQ-0002-008（不回归）
- **发现阶段**：v3（Phase 1）施工前置修复
- **日期**：2026-02-14

## 变更原因

当用户在已静态注入 content scripts 的站点上点击 “Grant Site”（或同一 tab 被多次 executeScript 注入）时，`content_isolated.js` 可能被重复注入，导致控制台报错：

- `Uncaught SyntaxError: Identifier 'BRIDGE_NAMESPACE' has already been declared`

根因：`content_isolated.js` 顶层使用 `const BRIDGE_NAMESPACE` 并注册 `chrome.runtime.onMessage` listener；重复注入会触发同一 JS 上下文里的重复声明与重复 listener。

## 变更内容

### 原设计

- SW 在 `wmcp:registerOrigin` 时会：
  - `registerContentScripts(...)`（持久化）
  - 对当前 tab `executeScript(...)` 立即注入（无需刷新）
- content scripts 假定只会注入一次。

### 新设计

- `content_isolated.js` 与 `main_bridge.js` 增加“幂等加载”保护：
  - 使用全局 sentinel 标记已加载
  - 重复注入时不重复注册 listener，避免竞态与重复响应

## 影响范围

- 受影响的代码文件：
  - `extension/content_isolated.js`
  - `extension/main_bridge.js`
- 受影响的需求：
  - 不改变需求范围，属于稳定性修复（避免 v2 权限策略下的重复注入崩溃）

## 处置方式

- [x] 代码已修复并通过回归：`verify.ps1` + `npm run test:e2e`
- [x] 本 ECN 留痕（避免未来误判为“随机浏览器问题”）

