# Insight Harness Product Spec

## One-liner

Insight Harness 是一个面向垂直行业研究场景的轻量级 Agent Harness Console，通过任务拆解、工具路由、执行追踪、质量评估和自动修复，让大模型研究流程从“直接回答”升级为“可调度、可观测、可迭代”。

## Background

垂直行业研究任务通常包含市场、用户、竞品、商业模式和进入建议等多个维度。如果直接让大模型生成答案，流程很容易变成黑盒：

```text
User Task -> LLM -> Answer
```

这类流程的问题是：

- 不知道模型拆了哪些研究维度
- 不知道工具为什么被调用
- 不知道中间证据是否足够
- 不知道结果质量是否稳定
- 不知道低质量结果如何自动修复

Insight Harness 的目标不是替代研究员，而是提供一个可控的 Agent 操控层。

## Target Users

主要用户：

- AI 产品经理
- 行业研究员
- 创业团队产品负责人
- 需要快速做垂直赛道判断的业务团队

典型场景：

- 判断一个垂直 AI SaaS 赛道是否值得进入
- 快速梳理某个行业的用户痛点和竞品格局
- 生成一份可复盘的研究执行链路
- 用评分和反馈沉淀 Agent 结果质量

## Core User Story

作为行业研究用户，我希望输入一个行业研究任务后，系统可以自动拆解任务、选择工具、记录执行过程、评估结果质量，并在证据不足时自动补充搜索，这样我可以更快得到一份可解释、可复盘的行业研究结论。

## MVP Scope

当前 MVP 只做一条核心链路：

```text
Research Task
-> Planner
-> Tool Router
-> Executor
-> Execution Trace
-> Synthesizer
-> Evaluator
-> Retry Loop
-> User Feedback
```

## Functional Requirements

### Planner

将用户输入的复杂行业研究任务拆成 3-5 个结构化子任务。

每个任务包含：

- `task`: 子任务描述
- `objective`: 为什么要做
- `tool`: 建议工具
- `priority`: 优先级
- `successCriteria`: 成功标准

### Tool Router

根据 Planner 输出的工具建议进行工具管控。

当前支持：

- `web_search`: 用于市场事实、竞品证据、价格信息、用户痛点
- `llm`: 用于综合判断、归纳、最终建议
- `calculator`: 用于市场规模、转化率、单价等简单估算

Router 会记录工具选择原因、调用限制和 fallback 决策。

### Execution Trace

记录每一步执行过程。

Trace 字段包括：

- `id`
- `time`
- `elapsedMs`
- `phase`
- `title`
- `meta`
- `mark`

支持导出 `execution-trace.json`。

### Evaluator

按三个指标评估最终结果：

- Completeness: 是否完成 Planner 子任务
- Evidence: 是否有足够证据
- Relevance: 是否回答原始问题

总分低于 80 时触发 Retry。

### Retry Loop

当 Evaluator 发现 Evidence 不足时，生成 Repair Task。

当前 Repair Task 示例：

```text
补充 AI 客服 SaaS 竞品价格与计费方式证据
```

Repair Task 会再次经过 Tool Router 和 Executor，补充证据后重新综合和评分。

### User Feedback

用户可以提交：

- Useful / Needs Improvement
- 文字反馈

反馈保存到浏览器本地，并支持导出 `feedback.csv`。

## Non-goals

当前版本不做：

- 用户登录
- 权限系统
- 长期记忆
- 向量数据库
- 多智能体协作
- 复杂 RAG
- 真实后端服务

这些能力会增加复杂度，但不会提升当前 Demo 对 Harness 核心能力的表达。

## Success Metrics

MVP 成功标准：

- 用户能在 1 分钟内理解 Harness 流程
- Demo 能展示 Plan -> Route -> Execute -> Observe -> Evaluate -> Retry
- Trace 能解释每一步发生了什么
- Evaluator 能解释为什么触发 Retry
- Feedback 能导出，形成后续迭代信号

## Roadmap

短期优化：

- 接入真实搜索 API
- 接入 LLM Planner
- 增加项目截图和 GitHub Pages 在线 Demo
- 增加任务类型选择，比如竞品分析、用户研究、产品定位

中期优化：

- 将 Trace 和 Feedback 保存到后端
- 增加不同垂直行业的评估权重
- 根据历史低分原因优化 Planner Prompt
- 增加工具调用成本和成功率统计
