# ECN-0011 — Options 右侧常驻 File Agent + Settings 点击收起 Side Panel

## Context

- 现有 Options（Settings）页面在 `Files` 页签内嵌了 “File Agent”，导致：
  - 只有切到 `Files` 页签才可见（不符合“独立于 Files 页签、放右侧常驻”的需求）
  - 版面不够清晰，容易把“文件管理器 UI”与“让 agent 管文件”的职责混在一起
- Side Panel 内点击 Settings 会打开 Options，但 Side Panel 仍占用网页右侧空间，用户希望点击后自动收起/隐藏。

## Decision

1) **Options 页面采用双栏布局**：
   - 左侧：`LLM / Files` 页签与对应 panel
   - 右侧：**常驻** `File Agent`（与页签无关，不随 `Files` 隐藏）

2) **File Agent 按需初始化 OPFS workspace**：
   - 当用户在未打开 `Files` 页签时直接使用 File Agent，仍可正常工作
   - workspace 初始化失败则明确报错（不臆造）

3) **Side Panel → Settings 时尝试收起当前 tab 的 Side Panel**：
   - Side Panel 点击 Settings：先向 background 发消息 `wmcp:hideSidePanel`
   - background 调用 `chrome.sidePanel.setOptions({ tabId, enabled: false })`（如 API 可用）
   - 随后打开 Options Page

## Consequences

- File Agent 不再与 Files 页签强绑定，降低误解与操作成本。
- Side Panel 收起行为依赖 `chrome.sidePanel.setOptions` 能力；若浏览器不支持该 API，会退化为“仅打开 Options，不收起 Side Panel”。

## Evidence

- `npm run test:e2e`（包含 `tests/e2e/options-file-manager.spec.ts` 等）通过。

