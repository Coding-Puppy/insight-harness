# Retry Loop Design

Retry Loop 是 Insight Harness 的闭环迭代模块。

Evaluator 发现问题后，Retry Loop 不会简单地整体重写答案，而是把问题转成更具体的 Repair Task，再补充执行。

## Why Retry Loop

没有 Retry 的 Agent 流程是：

```text
Generate -> Evaluate -> Done
```

即使评估发现质量不足，系统也不会自动修复。

加入 Retry Loop 后，流程变成：

```text
Generate -> Evaluate -> Diagnose Issue -> Repair Task -> Execute -> Re-synthesize -> Re-evaluate
```

这就是 Harness 的闭环迭代。

## Current Implementation

当前 Demo 中，Retry Loop 由 `evaluate()` 输出的 `repairTask` 驱动。

第一次评估时，如果 Evidence 分数不足，Evaluator 会输出：

```json
{
  "decision": "retry",
  "issues": ["竞品分析证据不足", "缺少价格与计费方式信息"],
  "repairTask": {
    "task": "补充 AI 客服 SaaS 竞品价格与计费方式证据",
    "tool": "web_search",
    "reason": "Evidence score below threshold"
  }
}
```

Retry Loop 会把它转成可执行任务：

```json
{
  "id": "R1",
  "type": "repair",
  "task": "补充 AI 客服 SaaS 竞品价格与计费方式证据",
  "objective": "补齐 Evaluator 发现的证据缺口",
  "tool": "web_search",
  "priority": "high",
  "successCriteria": "补充竞品价格、计费方式或定位证据，使 Evidence 分数达到阈值"
}
```

然后这条 Repair Task 会经过同样的 Harness 管线：

```text
Repair Task -> Tool Router -> Executor -> Observation -> Evidence Pool
```

补充证据进入 Evidence Pool 后，系统重新 synthesis，并再次 evaluation。

## Product Meaning

这里最重要的产品点是：

```text
不是整体重试，而是针对缺口修复。
```

这比简单 “regenerate” 更适合商业产品，因为：

- 成本更低
- 过程更可解释
- 问题定位更清楚
- 用户更容易相信系统在认真修复
- 后续可以统计常见失败原因

## Product Explanation

面试时可以这样讲：

> Retry Loop 是我设计的闭环迭代层。当 Evaluator 判断结果低于阈值时，系统不会直接整体重写，而是根据低分原因生成一个 Repair Task，比如补充竞品价格证据。这个 Repair Task 会再次经过 Tool Router 和 Executor，新的证据进入 Evidence Pool 后再重新综合和评分。这样 Harness 就形成了 Evaluate -> Repair -> Re-evaluate 的质量闭环。

## Future Improvements

- 根据不同低分维度生成不同 Repair Task
- 限制最大重试次数和预算
- 针对失败任务局部重跑，而不是只补充搜索
- 记录 Retry 前后分数提升，用于衡量 Harness 效果
- 将高频 Repair Task 反哺 Planner 和 Tool Router 策略
