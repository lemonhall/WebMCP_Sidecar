# ECN-0005: 去掉“先授权才见工具”的机制（改为 <all_urls> 注入）

## 基本信息

- **ECN 编号**：ECN-0005
- **关联 PRD**：PRD-0001 / PRD-0002
- **关联 Req ID**：REQ-0002-006、REQ-0002-008
- **发现阶段**：v3（Phase 1）实现中
- **日期**：2026-02-14

## 变更原因

原方案为兼容 Web Store 审核与最小权限，采用：

- 默认只对 demo 域名注入 content scripts
- 其它站点需用户点击 “Grant Site” 才能注册/注入脚本

实际使用中出现“必须先授权才能看到 tool”的鸡肋体验。柠檬叔明确要求：不以 Web Store 上架为目标，去掉该机制。

## 变更内容

### 原设计

- `host_permissions` 仅包含 demo 域名
- 通过 `optional_host_permissions` + `chrome.permissions.request` 动态扩展站点
- SW 负责 `registerContentScripts/executeScript` 注入

### 新设计

- 直接声明 `host_permissions: ["<all_urls>"]`
- `content_scripts.matches: ["<all_urls>"]`（ISOLATED + MAIN）
- 删除 “Grant Site” 入口与动态注册/修复逻辑

## 影响范围

- 受影响文件：
  - `extension/manifest.json`
  - `extension/background.js`
  - `extension/sidepanel.html`
  - `extension/sidepanel.js`
  - `extension/options.js`
- 风险：
  - 注入范围扩大（不影响本项目目标；不以 Web Store 上架为前提）

## 处置方式

- [ ] PRD/plan 如需对“权限策略”有描述，后续补齐统一口径
- [ ] 回归：`verify.ps1` + `npm run test:e2e`

