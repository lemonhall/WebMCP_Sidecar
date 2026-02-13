好，我直接把修订版写出来。基于三份 deep-research 报告的发现，主要改动集中在：API 认知纠正、架构分层重构（MAIN world 做薄）、桥接层序列化策略、polyfill 策略调整。

```markdown
# WebMCP Sidecar — 产品需求文档（v0.2）

> 状态：草案 / 概念验证阶段
> 作者：柠檬叔
> 日期：2026-02-13
> 变更：v0.2 — 基于 WebMCP 规范、MAIN world 注入边界、polyfill 可行性三份 deep-research 报告修订

---

## 一、愿景

Google 在 Chrome 146+ 中推出了 WebMCP 协议——让网站通过 `navigator.modelContext.registerTool()` 主动向浏览器注册结构化的工具接口，供 AI Agent 在用户监督下调用。

我们的目标：**做一个独立的 Chrome Sidecar 插件，用自己选择的 LLM（国产模型优先），驱动 WebMCP 协议。**

核心价值主张：

1. **模型无关** — 不绑定 Gemini，通过已有 TS SDK 接入任意 LLM（DeepSeek、Qwen、GLM 等）
2. **双向能力** —
   - 已支持 WebMCP 的网站：发现并调用其注册的工具
   - 未支持的网站：通过 SKILL 注入，为其"补"上工具注册能力
3. **Sidecar 体验** — 浏览器右侧 Side Panel，左侧正常浏览，右侧与 AI 对话并观察操作
4. **SKILL 驱动** — 复用已有 SKILL 技能体系，将"如何操控某类网站"封装为可复用规范

一句话：**一个跑在 Chrome 侧边栏里的 AI Agent，能调用网页暴露的工具，也能给任意网页注入工具能力，用你自己选的模型驱动一切。**

---

## 二、用户场景

### 场景 1：操控已支持 WebMCP 的网站

用户打开航班预订 demo（已通过 `registerTool()` 注册了 searchFlights 等工具）。

1. 打开 Sidecar 侧边栏
2. Sidecar 自动检测到 4 个已注册工具，面板中列出
3. 用户说："帮我搜明天北京到上海的直飞航班，2000 以下"
4. AI 依次调用 searchFlights → setFilters → listFlights
5. 页面实时更新，AI 在侧边栏返回结构化推荐

### 场景 2：给未支持 WebMCP 的网站"补"能力

用户打开某国内电商网站，无 WebMCP 支持。

1. Sidecar 加载预定义 SKILL（如 `taobao-search.skill`）
2. SKILL 通过 MAIN world 注入 polyfill + 工具注册
3. 后续流程与场景 1 一致

### 场景 3：开发者调试模式

前端开发者给自己的站点接入 WebMCP。

1. 打开本地开发站点
2. Sidecar Inspector 模式列出所有已注册工具、schema、参数
3. 可手动触发工具调用，查看返回值和页面变化
4. 支持用真实 LLM 做端到端测试

---

## 三、技术架构

### 3.0 关键认知修正（v0.1 → v0.2）

v0.1 中假设存在 `navigator.modelContext.tools()` 和 `tool.invoke()` 这类"页面侧列举/调用工具"的 API。

**实际规范（2026-02-12 Draft CG Report）中不存在这些方法。**

规范的模型是：
- 网页侧（provider）：`registerTool()` / `unregisterTool()` / `provideContext()` / `clearContext()` — 只管注册
- Agent 侧（consumer）：触发工具的 `execute(input, client)` 回调获取结果

网页是"被调用方"，不是"调用方"。我们的插件作为 Agent，需要：
1. 拦截/监听 `registerTool()` 调用来维护工具注册表
2. 主动触发工具的 `execute()` 回调来完成调用

这直接决定了下面的分层架构。

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                        Chrome 浏览器                          │
│                                                               │
│  ┌──────────────────────────┐   ┌──────────────────────────┐ │
│  │     目标网页 (左侧)       │   │    Side Panel (右侧)     │ │
│  │                          │   │                          │ │
│  │  ┌────────────────────┐  │   │  ┌────────────────────┐  │ │
│  │  │  页面原生 JS 上下文  │  │   │  │  Chat UI           │  │ │
│  │  │                    │  │   │  │  (对话界面)         │  │ │
│  │  │  navigator         │  │   │  ├────────────────────┤  │ │
│  │  │   .modelContext     │  │   │  │  Tool Inspector    │  │ │
│  │  │                    │  │   │  │  (工具面板)         │  │ │
│  │  └────────▲───────────┘  │   │  ├────────────────────┤  │ │
│  │           │              │   │  │  SKILL 管理器       │  │ │
│  │  ┌────────┴───────────┐  │   │  ├────────────────────┤  │ │
│  │  │  MAIN world bridge │  │   │  │  操作日志           │  │ │
│  │  │  (极薄注入层)       │  │   │  └────────────────────┘  │ │
│  │  │                    │  │   │            │              │ │
│  │  │  - hook register   │  │   └────────────│──────────────┘ │
│  │  │  - 维护工具注册表   │  │               │                │
│  │  │  - callTool()      │  │               │                │
│  │  │  - listTools()     │  │               │                │
│  │  │  - JSON 序列化出入  │  │               │                │
│  │  └────────┬───────────┘  │               │                │
│  │           │ postMessage  │               │                │
│  └───────────│──────────────┘               │                │
│              ▼                              │                │
│  ┌───────────────────────────────────────────│──────────────┐ │
│  │                  Service Worker                          │ │
│  │                 (后台调度中心)                             │ │
│  │                                                          │ │
│  │  ┌─────────────────┐    ┌────────────────────────────┐   │ │
│  │  │ Content Script   │    │  消息路由 & 调度             │   │ │
│  │  │ (ISOLATED world) │    │                            │   │ │
│  │  │                 │    │  ISOLATED ←→ SW 通信        │   │ │
│  │  │ - 监听 MAIN 的   │    │  工具调用编排               │   │ │
│  │  │   postMessage   │    │  LLM 请求/响应              │   │ │
│  │  │ - 转发给 SW     │    │  会话状态管理               │   │ │
│  │  │ - 安全过滤      │    │                            │   │ │
│  │  └─────────────────┘    └─────────────┬──────────────┘   │ │
│  │                                       │                  │ │
│  └───────────────────────────────────────│──────────────────┘ │
└──────────────────────────────────────────│────────────────────┘
                                           │
                                 ┌─────────▼──────────┐
                                 │    LLM API 层       │
                                 │                     │
                                 │  TS SDK (已有)       │
                                 │  ┌───────────────┐  │
                                 │  │ DeepSeek      │  │
                                 │  │ Qwen          │  │
                                 │  │ GLM           │  │
                                 │  │ OpenAI        │  │
                                 │  │ ...任意模型    │  │
                                 │  └───────────────┘  │
                                 └─────────────────────┘
```

### 3.2 核心设计原则：MAIN world 做薄

三份 deep-research 报告确认的关键约束：
- MAIN world 受页面 CSP 约束
- `executeScript` 返回值在 Chrome 中只支持 JSON-serializable（非 structured clone）
- `InjectionResult.error` Chrome 尚未实现
- MAIN world 代码对页面脚本可见，不应放敏感逻辑

因此架构原则：**MAIN world 只放一个极薄的 bridge，所有"聪明的事"都在 ISOLATED world 和 Service Worker 里做。**

### 3.3 模块详解

#### 模块 1：MAIN World Bridge（极薄注入层）

这是整个架构中最敏感的部分。注入到页面主世界，与页面 JS 共享执行环境。

职责（且仅限于）：
- hook `navigator.modelContext.registerTool()` 调用，拦截工具注册
- 维护一份工具注册表（name → { schema, execute ref }）
- 暴露 `window.__wmcp_bridge`，提供 `listTools()` 和 `callTool()` 两个方法
- 所有出入数据一律 `JSON.stringify()` / `JSON.parse()`
- 通过 `window.postMessage` 与 ISOLATED world 通信

```typescript
// main-world-bridge.ts — 注入到 MAIN world 的完整代码
// 设计目标：尽可能小，不触发 CSP，不依赖外部模块

(function () {
  // 工具注册表：name → { schema, description, annotations, execute }
  const _tools: Map<string, {
    name: string;
    description: string;
    inputSchema: object;
    annotations?: { readOnlyHint?: boolean };
    execute: (input: object, client: any) => Promise<any>;
  }> = new Map();

  // ---- polyfill / hook 逻辑 ----
  const hasNative = 'modelContext' in navigator;

  if (hasNative) {
    // 原生实现存在：hook registerTool 来拦截注册
    const origRegister = (navigator as any).modelContext.registerTool.bind(
      (navigator as any).modelContext
    );
    (navigator as any).modelContext.registerTool = function (tool: any) {
      _tools.set(tool.name, tool);
      origRegister(tool);
      // 通知 ISOLATED world 工具列表变更
      window.postMessage({
        type: '__wmcp_tools_changed',
        tools: JSON.parse(JSON.stringify(
          Array.from(_tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
          }))
        ))
      }, '*');
    };

    // 同理 hook unregisterTool / provideContext / clearContext
    const origUnregister = (navigator as any).modelContext.unregisterTool.bind(
      (navigator as any).modelContext
    );
    (navigator as any).modelContext.unregisterTool = function (name: string) {
      _tools.delete(name);
      origUnregister(name);
      window.postMessage({
        type: '__wmcp_tools_changed',
        tools: JSON.parse(JSON.stringify(
          Array.from(_tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
          }))
        ))
      }, '*');
    };

    const origProvide = (navigator as any).modelContext.provideContext.bind(
      (navigator as any).modelContext
    );
    (navigator as any).modelContext.provideContext = function (opts?: any) {
      _tools.clear();
      if (opts?.tools) {
        for (const t of opts.tools) _tools.set(t.name, t);
      }
      origProvide(opts);
      window.postMessage({
        type: '__wmcp_tools_changed',
        tools: JSON.parse(JSON.stringify(
          Array.from(_tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
          }))
        ))
      }, '*');
    };

    const origClear = (navigator as any).modelContext.clearContext.bind(
      (navigator as any).modelContext
    );
    (navigator as any).modelContext.clearContext = function () {
      _tools.clear();
      origClear();
      window.postMessage({ type: '__wmcp_tools_changed', tools: [] }, '*');
    };

  } else {
    // 无原生实现：安装 polyfill
    const modelContext = {
      registerTool(tool: any) {
        if (_tools.has(tool.name)) {
          throw new DOMException(
            `Tool "${tool.name}" already registered`,
            'InvalidStateError'
          );
        }
        _tools.set(tool.name, tool);
        window.postMessage({
          type: '__wmcp_tools_changed',
          tools: JSON.parse(JSON.stringify(
            Array.from(_tools.values()).map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              annotations: t.annotations,
            }))
          ))
        }, '*');
      },
      unregisterTool(name: string) {
        _tools.delete(name);
        window.postMessage({
          type: '__wmcp_tools_changed',
          tools: JSON.parse(JSON.stringify(
            Array.from(_tools.values()).map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              annotations: t.annotations,
            }))
          ))
        }, '*');
      },
      provideContext(opts?: any) {
        _tools.clear();
        if (opts?.tools) {
          for (const t of opts.tools) _tools.set(t.name, t);
        }
        window.postMessage({
          type: '__wmcp_tools_changed',
          tools: JSON.parse(JSON.stringify(
            Array.from(_tools.values()).map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              annotations: t.annotations,
            }))
          ))
        }, '*');
      },
      clearContext() {
        _tools.clear();
        window.postMessage({ type: '__wmcp_tools_changed', tools: [] }, '*');
      },
    };

    Object.defineProperty(navigator, 'modelContext', {
      value: modelContext,
      writable: false,
      configurable: true, // 留 true，未来原生实现可接管
    });
  }

  // ---- Bridge API（供 ISOLATED world 通过 postMessage 调用）----
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;

    if (event.data?.type === '__wmcp_call_tool') {
      const { requestId, toolName, args } = event.data;
      try {
        const tool = _tools.get(toolName);
        if (!tool) throw new Error(`Tool "${toolName}" not found`);

        // 构造最小 client（requestUserInteraction 暂不实现）
        const client = {
          requestUserInteraction: async (cb: () => Promise<any>) => cb(),
        };

        const result = await tool.execute(
          typeof args === 'string' ? JSON.parse(args) : args,
          client
        );

        window.postMessage({
          type: '__wmcp_tool_result',
          requestId,
          ok: true,
          result: JSON.parse(JSON.stringify(result ?? null)),
        }, '*');
      } catch (err: any) {
        window.postMessage({
          type: '__wmcp_tool_result',
          requestId,
          ok: false,
          error: err?.message ?? String(err),
        }, '*');
      }
    }

    if (event.data?.type === '__wmcp_list_tools') {
      const { requestId } = event.data;
      window.postMessage({
        type: '__wmcp_tools_list',
        requestId,
        tools: JSON.parse(JSON.stringify(
          Array.from(_tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
          }))
        )),
      }, '*');
    }
  });

  // 标记 bridge 已就绪
  window.postMessage({ type: '__wmcp_bridge_ready' }, '*');
})();
```

设计要点：
- 整个 bridge 是一个 IIFE，不依赖任何外部模块，不使用 eval/动态脚本加载，最大限度规避 CSP
- 所有跨边界数据都经过 `JSON.parse(JSON.stringify())` 双重序列化，确保只传 JSON-serializable 值
- `execute` 的引用保留在 MAIN world 的 `_tools` Map 中，不跨边界传递函数
- `configurable: true` 确保未来原生实现可接管
- `requestUserInteraction` 暂时直接执行回调（Phase 1 再做完整实现）

#### 模块 2：Content Script（ISOLATED world）

运行在扩展的隔离世界，是 MAIN world bridge 与 Service Worker 之间的安全中继。

职责：
- 监听 MAIN world 的 `postMessage`，过滤 `__wmcp_*` 前缀消息
- 转发给 Service Worker（`chrome.runtime.sendMessage`）
- 接收 Service Worker 的指令，转发给 MAIN world

```typescript
// content-isolated.ts

// 监听 MAIN world → ISOLATED world 的消息
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const { type } = event.data ?? {};

  // 只转发我们自己的消息
  if (typeof type === 'string' && type.startsWith('__wmcp_')) {
    chrome.runtime.sendMessage({
      source: 'content-isolated',
      payload: event.data,
    });
  }
});

// 监听 Service Worker → ISOLATED world 的消息
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg?.target === 'content-main') {
    // 转发给 MAIN world
    window.postMessage(msg.payload, '*');
  }
});
```

#### 模块 3：Service Worker（后台调度中心）

职责：
- 管理 Side Panel ↔ Content Script 之间的消息路由
- 维护每个 tab 的工具注册表镜像（从 MAIN world 同步过来）
- 编排工具调用序列（Agent loop）
- 管理 LLM API 请求/响应
- 维护会话状态

关键逻辑：

```typescript
// background.ts（核心调度逻辑摘要）

interface TabToolState {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: object;
    annotations?: { readOnlyHint?: boolean };
  }>;
  pendingCalls: Map<string, {
    resolve: (v: any) => void;
    reject: (e: Error) => void;
  }>;
}

const tabStates = new Map<number, TabToolState>();

// 来自 Content Script 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.source !== 'content-isolated') return;
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const payload = msg.payload;

  // 工具列表变更
  if (payload.type === '__wmcp_tools_changed') {
    const state = getOrCreateTabState(tabId);
    state.tools = payload.tools;
    // 通知 Side Panel 刷新工具列表
    notifySidePanel(tabId, { type: 'tools-updated', tools: payload.tools });
  }

  // 工具调用结果
  if (payload.type === '__wmcp_tool_result') {
    const state = tabStates.get(tabId);
    const pending = state?.pendingCalls.get(payload.requestId);
    if (pending) {
      if (payload.ok) {
        pending.resolve(payload.result);
      } else {
        pending.reject(new Error(payload.error));
      }
      state?.pendingCalls.delete(payload.requestId);
    }
  }
});

// 调用工具的核心方法
async function callTool(
  tabId: number,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const requestId = crypto.randomUUID();
  const state = getOrCreateTabState(tabId);

  return new Promise((resolve, reject) => {
    // 设置超时
    const timer = setTimeout(() => {
      state.pendingCalls.delete(requestId);
      reject(new Error(`Tool "${toolName}" call timed out (10s)`));
    }, 10_000);

    state.pendingCalls.set(requestId, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });

    // 发送调用指令到 Content Script → MAIN world
    chrome.tabs.sendMessage(tabId, {
      target: 'content-main',
      payload: {
        type: '__wmcp_call_tool',
        requestId,
        toolName,
        args: JSON.stringify(args),
      },
    });
  });
}
```

#### 模块 4：Side Panel（用户界面）

职责：
- 聊天对话界面
- 工具 Inspector 面板（展示工具 schema、手动触发调用）
- SKILL 管理器
- 操作日志（每步操作透明可审计）

技术选型：
- 框架：Preact 或 Solid.js（轻量，bundle 小）
- 样式：Tailwind CSS
- 构建：Vite + WXT（优先）或 CRXJS

> 注：v0.1 推荐了 CRXJS，但 deep-research 清单中标记了需要评估其维护状态。
> WXT 是当前社区更活跃的 Chrome 扩展 Vite 框架，建议 Phase 0 先评估 WXT。

#### 模块 5：LLM 适配层

职责：
- 封装已有 TS SDK，提供统一 function calling 接口
- 将 WebMCP 工具 schema 转换为 LLM function/tool 定义
- 处理流式响应
- 模型切换

关键设计：

```typescript
// WebMCP tool → LLM function calling 格式
// 天然优势：WebMCP 的 inputSchema 就是 JSON Schema 2020-12，
// 与主流 LLM 的 function calling 格式几乎一致

function webmcpToolToLLMFunction(tool: {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean };
}): LLMFunctionDef {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    // 可选：利用 annotations 给 LLM 额外提示
    // 比如 readOnlyHint=true 的工具可以标记为"安全调用，无副作用"
  };
}
```

### 3.4 数据流：一次完整的用户请求

```
用户在 Side Panel 输入: "帮我搜明天北京到上海的直飞航班"
  │
  ▼
Side Panel → chrome.runtime.sendMessage → Service Worker
  │
  ▼
Service Worker:
  1. 从 tabStates 获取当前 tab 的工具列表
     （已通过 __wmcp_tools_changed 事件同步）
  2. 将工具 schema 转换为 LLM function calling 格式
  3. 构造 prompt: 用户消息 + 可用工具定义 → 发给 LLM
  │
  ▼
LLM 返回 function_call:
  { name: "searchFlights", arguments: { origin: "PEK", ... } }
  │
  ▼
Service Worker 调用 callTool(tabId, "searchFlights", args):
  → chrome.tabs.sendMessage → Content Script (ISOLATED)
  → window.postMessage → MAIN world bridge
  │
  ▼
MAIN world bridge:
  → _tools.get("searchFlights").execute(args, client)
  → 页面内部逻辑执行（dispatch CustomEvent → React 更新等）
  → 页面 UI 实时变化（用户在左侧看到）
  → 返回结果 → JSON.stringify → postMessage
  │
  ▼
ISOLATED world → chrome.runtime.sendMessage → Service Worker
  → Service Worker 收到结果
  → 可能继续调用下一个工具（setFilters → listFlights）
  │
  ▼
最终 LLM 生成自然语言总结:
  "已搜索明天北京到上海的直飞航班，共 5 个结果，最便宜的是..."
  │
  ▼
Side Panel 展示 AI 回复 + 操作日志
```

### 3.5 消息协议汇总

| 消息类型 | 方向 | 载荷 |
|---|---|---|
| `__wmcp_bridge_ready` | MAIN → ISOLATED → SW | `{}` |
| `__wmcp_tools_changed` | MAIN → ISOLATED → SW | `{ tools: ToolSchema[] }` |
| `__wmcp_list_tools` | SW → ISOLATED → MAIN | `{ requestId }` |
| `__wmcp_tools_list` | MAIN → ISOLATED → SW | `{ requestId, tools }` |
| `__wmcp_call_tool` | SW → ISOLATED → MAIN | `{ requestId, toolName, args }` |
| `__wmcp_tool_result` | MAIN → ISOLATED → SW | `{ requestId, ok, result?, error? }` |

所有载荷均为 JSON-serializable，无函数、无 DOM 引用、无循环引用。

### 3.6 SKILL 注入机制

SKILL 的本质：为不支持 WebMCP 的网站提供一组工具定义 + 对应的 DOM 操作实现。

```typescript
// skill 定义示例: taobao-search.skill.ts
export const skill: SkillDefinition = {
  name: "taobao-search",
  version: "1.0.0",
  match: ["*.taobao.com", "*.tmall.com"],

  // 健康检查：验证页面结构是否符合预期
  healthCheck: () => {
    return !!document.querySelector("#q");
  },

  tools: [
    {
      name: "searchProduct",
      description: "在淘宝搜索商品",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词" }
        },
        required: ["keyword"]
      },
      annotations: { readOnlyHint: false },
      handler: async (params: { keyword: string }) => {
        const input = document.querySelector("#q") as HTMLInputElement;
        if (!input) throw new Error("搜索框未找到，页面结构可能已变更");
        input.value = params.keyword;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const btn = document.querySelector(".btn-search") as HTMLElement;
        if (!btn) throw new Error("搜索按钮未找到");
        btn.click();
        // 等待结果加载
        await new Promise(r => setTimeout(r, 2000));
        return { status: "搜索已发起", keyword: params.keyword };
      }
    }
  ]
};
```

注入流程：
1. 用户打开淘宝 → Service Worker 检测 URL 匹配到 SKILL
2. 通过 `chrome.scripting.executeScript({ world: "MAIN" })` 注入：
   - 如果页面无 `navigator.modelContext`：先注入 polyfill
   - 然后调用 `navigator.modelContext.registerTool()` 注册 SKILL 定义的工具
3. MAIN world bridge 拦截注册，同步工具列表给 Service Worker

好，接着写 v0.2 PRD 的剩余部分。

```markdown
---

## 四、权限模型与安全策略

### 4.1 Manifest 权限

```json
{
  "manifest_version": 3,
  "name": "WebMCP Sidecar",
  "version": "0.1.0",
  "permissions": [
    "sidePanel",
    "scripting",
    "activeTab",
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content-isolated.js"],
      "run_at": "document_start",
      "world": "ISOLATED"
    }
  ]
}
```

权限说明：
- `sidePanel`：Side Panel UI
- `scripting`：动态注入 MAIN world bridge 和 SKILL
- `activeTab`：用户主动点击扩展图标时获取当前 tab 权限（减少审核阻力）
- `storage`：存储用户配置（API key、模型选择、SKILL 列表）
- `tabs`：监听 tab 切换/URL 变化，触发 SKILL 匹配
- `<all_urls>`：MAIN world 注入需要 host 权限

### 4.2 Chrome Web Store 审核策略

`<all_urls>` + `scripting` 是高权限组合，审核会更严格。缓解措施：

1. **渐进式权限请求**：初始版本考虑用 `activeTab` + `chrome.permissions.request()` 按需申请，而非一开始就要 `<all_urls>`
2. **明确的隐私政策**：说明扩展不收集用户浏览数据，LLM API key 仅存本地
3. **MAIN world 注入的必要性说明**：审核描述中解释 WebMCP 协议需要访问页面主世界
4. **最小代码原则**：MAIN world 注入代码尽量小，便于审核人员 review

### 4.3 安全边界

| 层 | 信任级别 | 可访问 | 不可访问 |
|---|---|---|---|
| MAIN world bridge | 低（页面可见） | 页面 DOM/JS、工具注册表 | 扩展 API、API key、用户配置 |
| ISOLATED content script | 中 | DOM（隔离视图）、chrome.runtime | 页面 JS 变量、API key |
| Service Worker | 高 | chrome.* 全部 API、API key、存储 | DOM |
| Side Panel | 高 | chrome.runtime 通信、UI 渲染 | 页面 DOM |

关键安全规则：
- API key 只存在 Service Worker 的 `chrome.storage.local` 中，永不传入 MAIN world
- MAIN world bridge 不包含任何扩展标识信息
- ISOLATED content script 对 MAIN world 的 postMessage 做白名单过滤（只接受 `__wmcp_*` 前缀）
- 工具调用结果在 Service Worker 中做大小限制（防止恶意页面返回巨量数据）

---

## 五、SKILL 体系设计

### 5.1 SKILL 定义规范

```typescript
interface SkillDefinition {
  // 元信息
  name: string;                    // 唯一标识，如 "taobao-search"
  version: string;                 // 语义化版本
  description: string;             // 人类可读描述
  match: string[];                 // URL 匹配模式，如 ["*.taobao.com"]
  priority?: number;               // 同 URL 多 SKILL 时的优先级（默认 0）

  // 生命周期
  healthCheck: () => boolean;      // 页面结构校验（DOM 选择器是否存在）
  onActivate?: () => void;         // SKILL 激活时的初始化逻辑
  onDeactivate?: () => void;       // SKILL 停用时的清理逻辑

  // 工具定义
  tools: SkillTool[];
}

interface SkillTool {
  name: string;
  description: string;
  inputSchema: object;             // JSON Schema 2020-12
  annotations?: {
    readOnlyHint?: boolean;        // 与 WebMCP 规范对齐
  };
  handler: (params: any) => Promise<any>;  // DOM 操作实现
}
```

### 5.2 SKILL 注入流程

```
Tab URL 变化
  │
  ▼
Service Worker: URL 匹配 SKILL 列表
  │
  ├─ 无匹配 → 仅注入 MAIN world bridge（监听原生 WebMCP）
  │
  └─ 有匹配 → 注入 bridge + SKILL
       │
       ▼
     chrome.scripting.executeScript({ world: "MAIN" })
       │
       ▼
     MAIN world:
       1. 安装 polyfill（如需）
       2. 执行 healthCheck()
       3. 通过 → registerTool() 注册所有工具
       4. 失败 → postMessage 报告错误，不注册
```

### 5.3 SKILL 与原生 WebMCP 的共存

当页面同时有原生 WebMCP 工具和 SKILL 注入的工具时：

- 原生工具优先：如果原生已注册同名工具，SKILL 跳过该工具
- 工具列表合并：Side Panel 展示所有工具，标注来源（原生 / SKILL）
- 用户可手动禁用 SKILL 的特定工具

---

## 六、Agent Loop 设计

### 6.1 编排模式

采用 ReAct（Reasoning + Acting）模式，适合浏览器扩展的受限环境：

```
用户输入
  │
  ▼
┌─────────────────────────────────┐
│         Agent Loop              │
│                                 │
│  1. 构造 prompt:                │
│     - system prompt             │
│     - 可用工具定义              │
│     - 对话历史                  │
│     - 用户最新消息              │
│                                 │
│  2. 调用 LLM                    │
│     │                           │
│     ├─ 返回文本 → 输出给用户    │
│     │   → 循环结束              │
│     │                           │
│     └─ 返回 tool_call →         │
│        3. 执行工具调用          │
│        4. 将结果追加到对话历史  │
│        5. 回到步骤 2            │
│                                 │
│  安全阀:                        │
│  - 单轮最多 10 次工具调用       │
│  - 单次工具调用超时 10s         │
│  - 总轮次超时 60s               │
│                                 │
└─────────────────────────────────┘
```

### 6.2 System Prompt 模板

```typescript
function buildSystemPrompt(tools: ToolSchema[]): string {
  const toolSummary = tools.map(t =>
    `- ${t.name}: ${t.description}${t.annotations?.readOnlyHint ? ' (只读)' : ''}`
  ).join('\n');

  return `你是一个浏览器 AI 助手，运行在用户当前浏览的网页旁边。

你可以使用以下工具与网页交互：
${toolSummary}

规则：
1. 每次只调用一个工具，等待结果后再决定下一步
2. 调用工具前，先用一句话告诉用户你要做什么
3. 如果工具调用失败，尝试一次重试，仍失败则告知用户
4. 标记为"只读"的工具不会修改页面状态，可以放心调用
5. 非只读工具可能修改页面内容，调用前确认用户意图
6. 不要编造工具不存在的功能`;
}
```

### 6.3 用户确认机制

对于非只读工具调用，支持两种模式（用户可在设置中切换）：

- **自动模式**：AI 直接调用，操作日志中记录（默认）
- **确认模式**：每次非只读调用前，Side Panel 弹出确认卡片，用户点击"执行"后才继续

---

## 七、LLM 适配层详细设计

### 7.1 统一接口

```typescript
interface LLMProvider {
  name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk>;
  supportsToolUse: boolean;
}

interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: LLMFunctionDef[];
  temperature?: number;
  maxTokens?: number;
}

interface ChatResponse {
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage?: { promptTokens: number; completionTokens: number };
}
```

### 7.2 国产模型适配要点

| 模型 | function calling 格式 | 已知差异 |
|---|---|---|
| DeepSeek | OpenAI 兼容 | `tool_choice` 支持有限 |
| Qwen (通义) | OpenAI 兼容 | 部分版本需要 `enable_search: false` 避免冲突 |
| GLM (智谱) | OpenAI 兼容 | tool 参数需要 `string` 类型的 `arguments` |
| Moonshot | OpenAI 兼容 | 并行 tool_call 支持不稳定 |

> 注：以上为 v0.2 初步整理，deep-research 清单第 4 项（国产模型 function calling 格式差异）
> 的详细报告完成后需要更新此表。

### 7.3 WebMCP Schema → LLM Function 转换

```typescript
function convertTools(tools: ToolSchema[]): LLMFunctionDef[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: normalizeJsonSchema(tool.inputSchema),
    },
  }));
}

// JSON Schema 2020-12 → LLM 兼容子集
// 主要处理：移除 $schema/$id 等元字段，确保 type/properties/required 齐全
function normalizeJsonSchema(schema: object): object {
  const { $schema, $id, ...rest } = schema as any;
  return rest;
}
```

---

## 八、Phase 0 验证计划

### 8.0 Phase 0 前置验证（来自 deep-research gap）

在写任何业务代码之前，先跑通以下实测：

| 验证项 | 方法 | 通过标准 |
|---|---|---|
| `navigator` 可扩展性 | MAIN world 执行 `Object.isExtensible(window.navigator)` | 返回 `true` |
| polyfill 安装 | MAIN world 执行 `Object.defineProperty(navigator, 'modelContext', ...)` | 无异常，属性可读 |
| 返回值序列化边界 | MAIN world 返回 Date/Map/Error/大对象，记录行为 | 建立兼容性矩阵 |
| CSP 严格站点注入 | 在 GitHub/Google 上注入极简 bridge | bridge ready 消息可达 ISOLATED |
| postMessage 通信 | MAIN → ISOLATED → SW 全链路 | requestId 匹配，结果正确 |

### 8.1 Phase 0 目标（2 周）

用最小代码验证核心链路：**用户说话 → LLM 选工具 → 调用页面工具 → 返回结果**

交付物：
1. 可加载的 Chrome 扩展（开发者模式）
2. MAIN world bridge + ISOLATED content script + Service Worker 三层通信跑通
3. Side Panel 最简聊天界面
4. 接入一个 LLM（DeepSeek）
5. 用 Chrome 官方 WebMCP demo 页面做端到端验证

不做：
- SKILL 注入
- 多模型切换
- 操作日志 UI
- 用户确认机制

### 8.2 Phase 1 目标（4 周）

在 Phase 0 基础上补齐核心功能：

1. SKILL 注入机制 + 2-3 个示例 SKILL
2. 多模型切换（DeepSeek + Qwen）
3. Tool Inspector 面板
4. 操作日志
5. 用户确认机制（非只读工具）
6. `requestUserInteraction` 的完整实现

### 8.3 Phase 2 目标（4 周）

1. SKILL 编辑器 / 导入导出
2. 更多模型接入
3. 流式响应 UI
4. 会话历史持久化
5. Chrome Web Store 上架准备

---

## 九、技术选型汇总

| 组件 | 选型 | 理由 |
|---|---|---|
| 构建框架 | WXT（优先评估）或 CRXJS | WXT 社区更活跃，MV3 支持更好；CRXJS 作为备选 |
| UI 框架 | Preact | 轻量（3KB），JSX 兼容，适合 Side Panel |
| 样式 | Tailwind CSS | 原子化，bundle 可 tree-shake |
| LLM SDK | 已有 TS SDK | 复用现有代码，统一 function calling 接口 |
| 语言 | TypeScript | 类型安全，适合多层通信的消息类型定义 |
| 包管理 | pnpm | 快，磁盘占用小 |
| 测试 | Vitest | 与 Vite 生态一致 |

---

## 十、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| WebMCP 规范仍在演进，API 可能变化 | 适配层需要重写 | bridge 层做薄，变化只影响一个文件；持续跟踪规范 |
| 页面 CSP 阻断 MAIN world 注入 | 部分站点无法使用 | bridge 代码极简不触发 CSP；备选方案：`USER_SCRIPT` world |
| Chrome Web Store 审核拒绝 | 无法上架 | 渐进式权限；充分的隐私政策；必要时先做侧载版 |
| 国产模型 function calling 不稳定 | 工具调用失败率高 | 适配层做重试 + 降级（fallback 到 prompt 内嵌工具描述） |
| 页面结构变化导致 SKILL 失效 | 用户体验下降 | healthCheck 机制；SKILL 版本管理；失败时明确提示 |
| `executeScript` 返回值序列化失败 | 工具调用静默失败 | 所有返回值强制 JSON.stringify；bridge 内 try/catch 兜底 |

---

## 十一、待 deep-research 跟进项

以下为 v0.1 清单中尚未完成的 deep-research 项，完成后需回填到本文档：

| # | 主题 | 回填位置 | 状态 |
|---|---|---|---|
| 4 | 国产大模型 function calling 格式差异 | §7.2 国产模型适配要点 | 待研究 |
| 5 | WebMCP 工具 schema 到 LLM function 定义的映射完整性 | §7.3 转换逻辑 | 待研究 |
| 7 | CRXJS vs WXT vs Plasmo 构建框架对比 | §9 技术选型 | 待研究 |
| 8 | Chrome Web Store 对高权限组合的审核策略 | §4.2 审核策略 | 待研究 |
| 9 | 多轮工具调用的编排模式（ReAct vs Plan-and-Execute） | §6.1 编排模式 | 待研究 |
| 10 | SKILL 定义规范的设计参考 | §5.1 SKILL 定义规范 | 待研究 |

---

## 附录 A：v0.1 → v0.2 变更摘要

1. **API 认知纠正**：移除了不存在的 `tools()` / `invoke()` API，改为基于 `registerTool()` hook + 自维护注册表的架构
2. **架构分层重构**：新增 MAIN world bridge 层，明确"MAIN 做薄"原则
3. **消息协议设计**：定义了 `__wmcp_*` 前缀的完整消息协议，所有载荷 JSON-serializable
4. **polyfill 策略**：`configurable: true`，feature detection 优先，与未来原生实现兼容
5. **序列化策略**：所有跨边界数据强制 `JSON.parse(JSON.stringify())`
6. **安全边界**：明确四层信任级别，API key 永不进入 MAIN world
7. **Phase 0 前置验证**：新增 5 项实测验证，在写业务代码前确认基础假设
8. **构建框架**：从 CRXJS 优先改为 WXT 优先评估
```

v0.2 写完了。核心变化就是把"我们以为的 API"纠正为"规范实际定义的 API"，然后围绕这个事实重新设计了三层通信架构。MAIN world 做薄、JSON 序列化兜底、`configurable: true` 这三个决策是从 deep-research 报告里直接推导出来的。

下一步你可以挑清单里剩下的 6 个 deep-research 项继续推进，或者直接开始 Phase 0 前置验证。你想先搞哪个？