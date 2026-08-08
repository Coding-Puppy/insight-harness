# Tool Router Design

Tool Router 是 Insight Harness 的工具管控模块。

Planner 决定“要做哪些任务”，Tool Router 决定“每个任务可以用什么工具、为什么可以用、如果工具不合法该怎么处理”。

## Why Tool Router

如果没有 Tool Router，Agent 可能会随意调用工具：

```text
Task -> Any Tool -> Result
```

这会带来几个问题：

- 成本不可控，比如简单综合任务也频繁搜索
- 风险不可控，比如调用不存在或不适合的工具
- 过程不可解释，用户不知道为什么用了这个工具
- 后续评估困难，因为没有工具选择依据

加入 Tool Router 后，流程变成：

```text
Task Plan -> Tool Router -> Approved Tool Call -> Executor
```

Tool Router 是 Harness 对工具使用的治理层。

## Current Implementation

当前 Demo 中，工具策略定义在 `app.js` 的 `toolPolicies`：

```js
const toolPolicies = {
  web_search: {
    label: "Web Search",
    maxCalls: 4,
    allowedFor: ["market facts", "competitor evidence", "pricing", "user pain points"],
    reason: "需要外部事实、竞品、价格或趋势证据",
  },
  llm: {
    label: "LLM Reasoning",
    maxCalls: 2,
    allowedFor: ["synthesis", "reasoning", "prioritization", "final recommendation"],
    reason: "用于综合判断、归纳和建议生成",
  },
  calculator: {
    label: "Calculator",
    maxCalls: 1,
    allowedFor: ["market sizing", "unit economics", "conversion math"],
    reason: "用于 TAM、转化率或单价相关的快速估算",
  },
};
```

路由函数是 `routeTool(task)`。

它会读取 Planner 给出的 `task.tool`，然后做三件事：

1. 检查工具是否存在
2. 读取工具策略和调用限制
3. 返回一条可追踪的路由决策

## Route Decision

正常情况下：

```json
{
  "taskId": 1,
  "tool": "web_search",
  "label": "Web Search",
  "status": "approved",
  "reason": "需要外部事实、竞品、价格或趋势证据",
  "guardrail": "max 4 call(s) per harness run",
  "allowedFor": ["market facts", "competitor evidence", "pricing", "user pain points"]
}
```

如果 Planner 请求了未知工具：

```json
{
  "taskId": 1,
  "tool": "llm",
  "label": "LLM Reasoning",
  "status": "fallback",
  "reason": "Planner requested unknown tool, so Router fell back to LLM Reasoning.",
  "guardrail": "unknown_tool_blocked"
}
```

这体现了 Harness 的控制能力：Planner 可以建议工具，但最终是否允许调用，由 Tool Router 决定。

## Product Explanation

> Tool Router 是工具管控层。Planner 会给每个子任务建议工具，但 Harness 不会直接照单全收。Router 会检查工具是否合法，读取工具策略，记录调用原因和限制。如果 Planner 请求未知工具，系统会阻断并 fallback 到安全工具。这样可以让 Agent 的工具使用变得可控、可解释、可观测。

## Future Improvements

- 按用户权限限制可用工具
- 按任务预算限制工具调用次数
- 根据任务类型动态选择搜索、数据库、CRM、BI 等外部工具
- 记录工具调用成本，用于评估 ROI
- 对高风险工具增加人工确认
