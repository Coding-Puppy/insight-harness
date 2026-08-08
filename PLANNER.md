# Planner Design

Planner 是 Insight Harness 的任务调度模块。

它不直接回答用户问题，而是把一个模糊的大目标拆成后续模块可以执行、追踪和评估的结构化任务计划。

## Why Planner

如果没有 Planner，Agent 的流程通常是：

```text
User Task -> LLM -> Answer
```

这个流程的问题是：

- 任务边界不清晰，模型可能漏掉关键分析维度
- 工具调用不可控，模型可能该搜索时不搜索
- 后续评估困难，因为系统不知道原本应该完成哪些子任务

加入 Planner 后，流程变成：

```text
User Task -> Planner -> Task Plan -> Tool Router -> Executor -> Evaluator
```

Planner 让 Harness 先明确“要做哪些事”，再进入工具调用和结果生成。

## Current Implementation

当前 Demo 中，Planner 位于 `app.js` 的 `planTask(goal)`。

输入：

```text
分析 AI 客服 SaaS 市场是否值得进入
```

输出：

```json
{
  "goal": "分析 AI 客服 SaaS 市场是否值得进入",
  "domain": "AI 客服 SaaS",
  "planning_strategy": "market_entry_research",
  "tasks": [
    {
      "id": 1,
      "task": "识别 AI 客服 SaaS 的目标用户与核心痛点",
      "objective": "判断真实需求是否足够强，以及用户为什么会付费",
      "tool": "web_search",
      "priority": "high",
      "successCriteria": "至少提炼 3 类目标用户和 3 个高频痛点"
    }
  ]
}
```

## Field Meaning

`goal`

用户的原始目标。后续 Evaluator 会用它判断最终答案是否真正回答了问题。

`domain`

从用户目标里抽取出的垂直行业或赛道，用来生成更贴近场景的子任务。

`planning_strategy`

当前使用的规划策略。Demo 使用 `market_entry_research`，表示这是一个市场进入判断型研究任务。

`tasks`

子任务数组。每个子任务都必须足够具体，能够被分配工具、执行、记录和评估。

`objective`

解释为什么要做这个子任务。它让任务不只是“动作”，而是有明确产品目的。

`tool`

Planner 给出的工具建议，后续 Tool Router 会基于它做工具管控。

`priority`

任务优先级。真实产品中可以用于控制执行顺序、预算和失败降级策略。

`successCriteria`

成功标准。Evaluator 可以用它判断这个子任务是否完成。

## Product Explanation

> Planner 是 Harness 的任务调度层。它不会直接生成答案，而是先把用户的行业研究目标拆成结构化任务计划。每个任务包含目标、工具建议、优先级和成功标准。这样后续模块就可以围绕同一份计划进行工具路由、执行追踪和质量评估。

## Future Improvements

- 用真实 LLM Prompt 动态生成 Planner JSON，参考 [Planner Prompt](./PLANNER_PROMPT.md)
- 增加不同任务类型的 planning strategy，比如竞品分析、用户研究、产品定位
- 根据任务预算限制子任务数量和工具调用次数
- 让 Evaluator 按每个 `successCriteria` 逐项打分
