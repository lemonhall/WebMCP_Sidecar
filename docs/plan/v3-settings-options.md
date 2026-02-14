# v3 — Settings（Options Page：LLM 配置 + Test LLM）

## Goal

在不引入 secrets 到 MAIN world 的前提下，为 Phase 1 提供最小可用的 LLM 配置与连通性测试能力。

## PRD Trace

- REQ-0002-001
- REQ-0002-002
- REQ-0002-007

## Scope

做：
- 新增 Options Page（Settings UI）
- `chrome.storage.local` 持久化 `baseUrl/apiKey/model`
- “Test LLM” 发起最小请求并回显成功/错误

不做：
- Provider 兼容矩阵（国产模型差异后置）
- 高级设置（代理、超时、重试、日志等级等先留口）

## Acceptance（硬口径）

- 能通过 `chrome.runtime.openOptionsPage()` 打开 Settings
- 保存后再次打开仍显示相同值（至少 baseUrl/model；apiKey 用密码框显示但可持久化）
- 点击 “Test LLM”：
  - 成功：显示 `ok: true` + 简短结果摘要
  - 失败：显示 `ok: false` + `message`
- 代码层可证明：`extension/main_bridge.js` 不读取、不接收 `apiKey/baseUrl`

## Verify

- 手工：
  1) 打开 Side Panel → 点 Settings
  2) 填入 `baseUrl/apiKey/model` → Save
  3) 点击 Test LLM，看到成功/错误回显
- 自动化（v3 E2E 里覆盖）：见 `docs/plan/v3-e2e-agent.md`

## Files（预计）

- `extension/manifest.json`（声明 options）
- `extension/options.html`
- `extension/options.js`
- `extension/sidepanel.html` / `extension/sidepanel.js`（入口按钮）
- `tests/e2e/*`（新增覆盖）

## Risks

- 不同 OpenAI-compatible 服务的响应格式差异：先做最小请求与错误透传，避免过早“泛兼容”。

