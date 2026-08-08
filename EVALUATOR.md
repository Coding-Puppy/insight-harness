# Evaluator Design

Evaluator 是 Insight Harness 的质量评估模块。

Planner 决定要做什么，Tool Router 决定用什么工具，Execution Trace 记录过程，而 Evaluator 判断最终结果是否足够好。

## Why Evaluator

没有 Evaluator 的 Agent 只能“生成完就结束”：

```text
Task -> Answer -> Done
```

这会带来几个问题：

- 答案看起来完整，但可能缺少证据
- 模型完成了生成，但没有完成用户真正想要的研究目标
- 系统不知道什么时候应该重试
- 产品团队无法沉淀稳定的质量指标

加入 Evaluator 后，流程变成：

```text
Answer -> Rubric Score -> Pass / Retry
```

Evaluator 把主观的“好不好”变成可以观察和控制的分数。

## Current Implementation

当前 Demo 中，Evaluator 位于 `app.js` 的 `evaluate(plan, synthesis, attempt)`。

它评估三个指标：

```text
Completeness: 是否完成 Planner 里的全部子任务
Evidence: 是否有足够证据支撑判断
Relevance: 是否真正回答原始问题
```

每个指标都是 1-5 分，然后加权计算总分：

```text
overall = (Completeness * 0.35 + Evidence * 0.40 + Relevance * 0.25) * 20
```

当前阈值：

```text
overall >= 80 -> pass
overall < 80  -> retry
```

## Evaluation Output

Evaluator 输出结构类似：

```json
{
  "completeness": 5,
  "evidence": 3,
  "relevance": 5,
  "overall": 76,
  "threshold": 80,
  "decision": "retry",
  "issues": ["竞品分析证据不足", "缺少价格与计费方式信息"],
  "repairTask": {
    "task": "补充 AI 客服 SaaS 竞品价格与计费方式证据",
    "tool": "web_search",
    "reason": "Evidence score below threshold"
  }
}
```

## Product Meaning

Evaluator 的价值不只是打分，而是把评分变成 Harness 的控制信号。

当 Evidence 分数不足时，系统不是整体重新生成，而是创建一个更具体的 Repair Task：

```text
补充 AI 客服 SaaS 竞品价格与计费方式证据
```

这就形成了：

```text
Evaluate -> Diagnose Issue -> Create Repair Task -> Retry
```

## UI

页面中的 Evaluator Report 会展示：

- Completeness 分数和理由
- Evidence 分数和理由
- Relevance 分数和理由
- Pass / Retry 决策

这让质量评估从隐藏逻辑变成可解释的产品界面。

## Product Explanation

面试时可以这样讲：

> Evaluator 是我设计的质量控制层。它会根据 Planner 的成功标准和最终输出，从完整度、证据度、相关性三个维度打分，并计算总分。当分数低于阈值时，Evaluator 不只是说结果不好，还会诊断问题并生成 Repair Task，驱动后续 Retry。这样 Harness 就从一次性生成变成了可评估、可修复的闭环系统。

## Future Improvements

- 用 LLM-as-a-judge 生成更细粒度的评分理由
- 按每个 Planner `successCriteria` 做逐项评分
- 加入事实一致性、引用质量、时效性等指标
- 根据不同垂直行业配置不同评分权重
- 将用户反馈与 Evaluator 分数对齐，持续调整阈值
