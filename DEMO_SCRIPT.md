# Demo Script

这份文档用于项目演示说明。

## Demo Goal

展示 Insight Harness 不是一个 ChatGPT Clone，而是一个围绕垂直行业研究任务设计的 Agent Harness Console。

核心展示点：

```text
任务调度 -> 工具管控 -> 效果观测 -> 闭环迭代
```

## Before Demo

打开 `index.html`。

默认任务：

```text
分析 AI 客服 SaaS 市场是否值得进入
```

点击：

```text
Run Harness
```

## 1-minute Version

可以这样讲：

> 这个项目叫 Insight Harness，是我为垂直行业研究场景做的轻量级 Agent Harness Demo。它不是直接让大模型回答问题，而是把研究任务拆成 Planner、Tool Router、Execution Trace、Evaluator 和 Retry Loop。用户输入一个行业研究问题后，系统会先生成结构化任务计划，再为每个任务选择工具，记录执行过程，最后用完整度、证据度、相关性评分。如果分数低于阈值，系统会生成 Repair Task，补充搜索证据并重新评分。这个 Demo 主要展示的是 Agent 如何被 Harness 控制、观测和迭代。

## 3-minute Walkthrough

### Step 1: Research Task

指向顶部输入框：

> 这里输入的是一个垂直行业研究任务，比如“分析 AI 客服 SaaS 市场是否值得进入”。普通 ChatGPT 会直接生成答案，但 Harness 会先进入任务调度流程。

### Step 2: Planner

指向 `Planner Output`：

> Planner 不直接回答问题，而是把目标拆成结构化 JSON。每个子任务都有 task、objective、tool、priority 和 successCriteria。这样后续模块知道应该执行哪些任务，也知道什么叫完成。

重点：

```text
Planner = 任务调度
```

### Step 3: Tool Router

指向左侧 Trace 中的 `router` 阶段：

> Planner 可以建议工具，但 Harness 不会直接照单全收。Tool Router 会检查工具是否合法，读取工具策略，并记录为什么允许调用。比如竞品和价格信息适合 web_search，最终综合适合 llm。

重点：

```text
Tool Router = 工具管控
```

### Step 4: Execution Trace

指向左侧 Execution Trace：

> 这里展示每一步执行链路，包括 planner、router、executor、evaluator 和 retry。每条 Trace 都有阶段、时间、耗时和观测信息。这样 Agent 不再是黑盒，而是可以被复盘。

重点：

```text
Execution Trace = 过程观测
```

### Step 5: Evaluator

指向 `Evaluator Report`：

> Evaluator 会从 Completeness、Evidence、Relevance 三个维度评分。第一次运行时，Evidence 分数偏低，因为竞品价格和计费方式证据不足，所以总分低于 80，系统判断需要 Retry。

重点：

```text
Evaluator = 质量观测
```

### Step 6: Retry Loop

指向 Trace 中的 `retry` 阶段：

> Retry 不是简单整体重写，而是根据低分原因生成 Repair Task。这里系统会补充 AI 客服 SaaS 竞品价格和计费方式证据，然后重新综合和评分。这个过程形成 Evaluate -> Repair -> Re-evaluate 的闭环。

重点：

```text
Retry Loop = 闭环迭代
```

### Step 7: Feedback

指向底部 User Feedback：

> 自动评分之外，我也保留了用户反馈入口。用户可以标记 Useful 或 Needs Improvement，并填写反馈，系统可以导出 CSV。这个反馈可以用于后续 Prompt、工具策略和评估阈值优化。

## Key Points

> 项目关注的不是让模型生成一篇更漂亮的报告，而是让 Agent 的执行过程可调度、可管控、可观测、可迭代。

> Planner 解决任务调度，Tool Router 解决工具管控，Execution Trace 和 Evaluator 解决效果观测，Retry Loop 和 Feedback 解决闭环迭代。

> 刻意没有做复杂多智能体、向量数据库或用户系统，因为重点是把 Harness 的四个核心能力表达清楚。

> 当前版本同时支持规则模拟和 Live Mode；文档里也补了 LLM Planner Prompt 与校验规则。

## FAQ

### 为什么不做聊天界面？

因为这个项目的重点不是聊天，而是 Harness Console。聊天界面只能展示输入和输出，Console 可以展示 Planner、工具路由、执行链路、评分和重试，更能体现 Agent 被控制的过程。

### 为什么 Retry 只补充竞品价格证据？

因为第一次 Evaluator 诊断出来的问题是 Evidence 不足，具体缺口是竞品价格和计费方式。所以 Retry 不应该整体重写，而应该针对缺口补充证据。

### 真实业务里 Planner 怎么实现？

Demo Mode 可用规则模拟；Live Mode 可用 LLM Planner。项目里有 `PLANNER_PROMPT.md`，定义了 System Prompt、JSON Schema 和校验规则。

### 这个项目怎么继续做？

优先完善搜索与 Planner 稳定性，然后把 Trace、Feedback 保存到后端，再根据历史评分和用户反馈优化 Prompt、工具策略和 Evaluator 阈值。
