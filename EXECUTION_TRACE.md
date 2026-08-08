# Execution Trace Design

Execution Trace 是 Insight Harness 的过程观测模块。

Planner 和 Tool Router 负责做决策，Execution Trace 负责把这些决策、工具调用、观测结果、评估结果记录下来。

## Why Execution Trace

没有 Trace 的 Agent 是黑盒：

```text
Input -> ? -> Answer
```

用户只能看到最终答案，但不知道：

- Agent 拆了哪些任务
- 每个任务用了什么工具
- 工具调用是否成功
- 中间拿到了什么证据
- 为什么触发重试
- 最终质量评分从哪里来

加入 Execution Trace 后，流程变成：

```text
Input -> Plan -> Route -> Execute -> Observe -> Evaluate -> Retry -> Answer
```

每一步都可以被查看、解释和导出。

## Current Implementation

当前 Demo 中，Trace 由 `app.js` 的 `addTrace()` 和 `renderTrace()` 管理。

每条 Trace Item 包含：

```json
{
  "id": 1,
  "time": "11:42:08",
  "elapsedMs": 142,
  "phase": "planner",
  "title": "Planning started",
  "meta": "LLM Planner receives the user research goal.",
  "mark": "•"
}
```

字段含义：

- `id`: 当前运行内的日志序号
- `time`: 真实发生时间
- `elapsedMs`: 距离本次 Harness 开始运行的耗时
- `phase`: 所属阶段，比如 planner、router、executor、evaluator、retry
- `title`: 这一步发生了什么
- `meta`: 更详细的观测信息
- `mark`: UI 中展示的状态符号

## Observed Phases

当前 Trace 会记录这些阶段：

1. `planner`: 开始规划、生成任务计划
2. `router`: 工具路由决策，包括工具策略和 guardrail
3. `executor`: 工具执行结果，包括结果数量和模拟耗时
4. `synthesizer`: 将证据合成为研究输出
5. `evaluator`: 质量评分和问题识别
6. `retry`: 低分时触发修复任务
7. `complete`: Harness 完成运行

## Export

页面左侧 Trace 区域提供导出按钮，可导出：

```text
execution-trace.json
```

导出内容包括：

- 本次运行摘要
- 完整 Trace Items
- 最终评分、工具调用数、重试次数和耗时

这让 Demo 不只是可视化，也具备基本的观测数据沉淀能力。

## Product Explanation

面试时可以这样讲：

> Execution Trace 是我设计的可观测层。它会记录 Planner、Router、Executor、Evaluator 和 Retry 的关键事件，包括阶段、时间、耗时、工具选择原因、观测结果和评分。这样 Agent 不再是直接给答案的黑盒，而是一个可以被追踪、复盘和迭代的 Harness 流程。

## Future Improvements

- 将 Trace 保存到服务端数据库
- 支持按任务、工具、阶段过滤日志
- 增加错误 Trace 和异常恢复记录
- 统计不同工具的平均耗时和成功率
- 将 Trace 与用户反馈关联，用于后续 Prompt 和工具策略优化
