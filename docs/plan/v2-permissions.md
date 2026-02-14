# v2 — 可选权限 + 站点白名单

## Goal

让稳定版 Chrome 在更多站点上也能工作：用户在 Side Panel 里一键授权当前站点（可选 host 权限），并立即注入脚本跑通 “Refresh/Call”。

## PRD Trace

- REQ-0001-009

## Acceptance

- Side Panel 显示当前 tab 的 origin
- 点击 “Grant” 后：权限申请弹窗出现（用户确认），成功后立刻注入脚本（无需手动刷新）

## Verify（手工）

1. 打开任意 https 网站（非 demo 域名）
2. 打开 Side Panel，点击 Grant
3. 刷新页面或直接点击 Refresh，看工具列表（若站点无 WebMCP，则列表为空是预期）

