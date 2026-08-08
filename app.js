const STORAGE_KEYS = {
  liveMode: "insightHarnessLiveMode",
};

const els = {
  task: document.querySelector("#researchTask"),
  run: document.querySelector("#runButton"),
  reset: document.querySelector("#resetButton"),
  exportTrace: document.querySelector("#exportTrace"),
  trace: document.querySelector("#traceList"),
  output: document.querySelector("#researchOutput"),
  scoreChip: document.querySelector("#scoreChip"),
  status: document.querySelector("#statusDot"),
  toolCalls: document.querySelector("#toolCalls"),
  latency: document.querySelector("#latency"),
  retryCount: document.querySelector("#retryCount"),
  quality: document.querySelector("#quality"),
  evidence: document.querySelector("#evidence"),
  completeness: document.querySelector("#completeness"),
  plannerOutput: document.querySelector("#plannerOutput"),
  evaluationReport: document.querySelector("#evaluationReport"),
  evaluationDecision: document.querySelector("#evaluationDecision"),
  feedbackForm: document.querySelector("#feedbackForm"),
  feedbackText: document.querySelector("#feedbackText"),
  feedbackChoices: document.querySelectorAll(".feedback-choice"),
  exportFeedback: document.querySelector("#exportFeedback"),
  liveModeToggle: document.querySelector("#liveModeToggle"),
  modeBadge: document.querySelector("#modeBadge"),
};

const state = {
  selectedFeedback: "Useful",
  lastRun: null,
  traceItems: [],
  runStartedAt: null,
  mode: "demo",
};

const toolPolicies = {
  web_search: {
    label: "Web Search",
    maxCalls: 4,
    allowedFor: ["market facts", "competitor evidence", "pricing", "user pain points"],
    reason: "需要外部事实、竞品、价格或趋势证据（Live Mode 使用 Gemini Google Search Grounding）",
  },
  llm: {
    label: "LLM Reasoning",
    maxCalls: 2,
    allowedFor: ["synthesis", "reasoning", "prioritization", "final recommendation"],
    reason: "用于综合判断、归纳和建议生成（Live Mode 使用 Gemini 2.5 Flash）",
  },
  calculator: {
    label: "Calculator",
    maxCalls: 1,
    allowedFor: ["market sizing", "unit economics", "conversion math"],
    reason: "用于 TAM、转化率或单价相关的快速估算",
  },
};

const marketEvidence = [
  {
    query: "AI customer service SaaS market growth enterprise adoption",
    title: "企业客服从人工坐席向 AI Agent 和知识库自动化迁移",
    source: "Market Scan",
    insight:
      "需求集中在降本、7x24 响应、多语言覆盖和工单自动分流，尤其适合高频咨询、标准化流程多的 SaaS、跨境电商与金融科技团队。",
  },
  {
    query: "AI客服 SaaS 用户痛点",
    title: "用户痛点从聊天机器人效果差转向可控、可评估、可接入业务系统",
    source: "User Review Digest",
    insight:
      "客户不只要回答准确，还要求知识更新、转人工策略、权限边界、质检报表和可追溯的回答依据。",
  },
  {
    query: "Intercom Zendesk Ada Fin AI Agent pricing competitors",
    title: "主流竞品已从基础 bot 升级为按解决量或坐席效率计价",
    source: "Competitor Desk",
    insight:
      "Intercom、Zendesk、Ada、Gorgias 等玩家占据中高端入口，新进入者需要用垂直行业模板、部署速度或本地化服务形成差异。",
  },
  {
    query: "AI customer support automation ROI",
    title: "ROI 叙事明确，但采购方担心幻觉、集成成本和品牌风险",
    source: "Buyer Notes",
    insight:
      "进入机会不在通用客服机器人，而在可审计、可灰度、能和 CRM/工单/知识库深度联动的行业方案。",
  },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPublicConfig() {
  return window.INSIGHT_HARNESS_PUBLIC_CONFIG || {};
}

function getLocalConfig() {
  return window.INSIGHT_HARNESS_CONFIG || {};
}

function getProxyUrl() {
  return String(getLocalConfig().proxyUrl || getPublicConfig().proxyUrl || "").trim();
}

function hasProxy() {
  return Boolean(getProxyUrl());
}

function hasLiveCredential() {
  return hasProxy();
}

function isLiveModePreferred() {
  const stored = sessionStorage.getItem(STORAGE_KEYS.liveMode);
  if (stored === "1") return true;
  if (stored === "0") return false;
  if (typeof getLocalConfig().liveMode === "boolean") {
    return getLocalConfig().liveMode;
  }
  if (typeof getPublicConfig().liveModeDefault === "boolean") {
    return getPublicConfig().liveModeDefault;
  }
  return hasProxy();
}

function canUseLiveMode() {
  return Boolean(els.liveModeToggle.checked && hasLiveCredential());
}

function updateModeBadge() {
  const live = canUseLiveMode();
  state.mode = live ? "live" : "demo";
  els.modeBadge.textContent = live ? "Live · Shared Proxy" : "Demo Mode";
  els.modeBadge.classList.toggle("live", live);
}

function initConfigUi() {
  const proxyReady = hasProxy();
  els.liveModeToggle.checked = isLiveModePreferred() && proxyReady;
  if (els.liveModeToggle.checked) {
    sessionStorage.setItem(STORAGE_KEYS.liveMode, "1");
  }

  const hint = document.querySelector("#configHint");
  if (hint) {
    hint.textContent = proxyReady
      ? "Live Mode 通过服务端 Proxy 调用 Gemini 2.5 Flash 与 Google Search Grounding，无需填写 Key。关闭后使用本地 Demo Mode。"
      : "当前未配置 Proxy，仅可使用 Demo Mode。请部署 worker/ 并在 config.public.js 填写 proxyUrl。";
  }

  updateModeBadge();
}

function renderTrace() {
  els.trace.innerHTML = state.traceItems
    .map(
      (item) => `
        <li>
          <span class="trace-time">${item.time}</span>
          <div class="trace-main">
            <div class="trace-title">
              <span class="mark">${item.mark}</span>
              ${item.title}
              <span class="trace-badge">${item.phase}</span>
            </div>
            <div class="trace-meta">${item.meta}</div>
          </div>
        </li>
      `,
    )
    .join("");
}

async function addTrace(phase, title, meta, mark = "✓", delay = 180) {
  await wait(delay);
  const elapsedMs = state.runStartedAt ? Math.round(performance.now() - state.runStartedAt) : 0;
  state.traceItems.push({
    id: state.traceItems.length + 1,
    time: nowTime(),
    elapsedMs,
    phase,
    title,
    meta,
    mark,
  });
  renderTrace();
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Empty model response");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}

function getResponseText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

async function callGemini({
  prompt,
  systemInstruction,
  json = false,
  useSearch = false,
  temperature = 0.3,
}) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    throw new Error("Missing proxyUrl. Deploy worker/ and set config.public.js first.");
  }

  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      systemInstruction,
      json,
      useSearch,
      temperature,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Proxy error (${response.status})`);
  }

  const text = payload.text || getResponseText(payload.payload);
  if (!text && !useSearch) {
    throw new Error("Proxy returned an empty response");
  }

  return {
    text,
    payload: payload.payload || payload,
    groundingMetadata: payload.groundingMetadata || null,
  };
}

function planTask(goal) {
  const normalizedGoal = goal.trim() || "分析 AI 客服 SaaS 市场是否值得进入";
  const domain = inferDomain(normalizedGoal);

  return {
    goal: normalizedGoal,
    domain,
    planning_strategy: "market_entry_research",
    source: "demo_rules",
    tasks: [
      {
        id: 1,
        task: `识别${domain}的目标用户与核心痛点`,
        objective: "判断真实需求是否足够强，以及用户为什么会付费",
        tool: "web_search",
        priority: "high",
        successCriteria: "至少提炼 3 类目标用户和 3 个高频痛点",
      },
      {
        id: 2,
        task: `梳理${domain}的主要竞品与定价方式`,
        objective: "确认竞争格局、成熟玩家和差异化空间",
        tool: "web_search",
        priority: "high",
        successCriteria: "至少覆盖 3 个竞品，并说明它们的定位或计费逻辑",
      },
      {
        id: 3,
        task: `总结${domain}的商业模式与切入机会`,
        objective: "找到可落地的商业化路径，而不是停留在概念判断",
        tool: "web_search",
        priority: "medium",
        successCriteria: "输出 2-3 个可验证的进入切口",
      },
      {
        id: 4,
        task: "综合判断是否值得进入并给出建议",
        objective: "把外部证据转化为产品进入建议",
        tool: "llm",
        priority: "high",
        successCriteria: "给出明确结论、目标客群、MVP 功能和主要风险",
      },
    ],
  };
}

function inferDomain(goal) {
  const cleaned = goal
    .replace(/分析|研究|评估|是否值得进入|市场|机会|行业|赛道/g, "")
    .replace(/[，。！？、,.!?]/g, " ")
    .trim();

  if (!cleaned) {
    return "AI 客服 SaaS";
  }

  return cleaned.length > 18 ? cleaned.slice(0, 18) : cleaned;
}

function validatePlan(plan, fallbackGoal) {
  if (!plan || typeof plan !== "object") {
    throw new Error("Plan is not an object");
  }

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  if (tasks.length < 3 || tasks.length > 5) {
    throw new Error("Plan must contain 3-5 tasks");
  }

  const allowedTools = new Set(["web_search", "llm", "calculator"]);
  const normalizedTasks = tasks.map((task, index) => {
    const tool = String(task.tool || "").trim();
    if (!allowedTools.has(tool)) {
      throw new Error(`Invalid tool: ${tool}`);
    }
    if (!task.task || !task.objective || !task.successCriteria) {
      throw new Error("Task is missing required fields");
    }
    return {
      id: Number(task.id) || index + 1,
      task: String(task.task).trim(),
      objective: String(task.objective).trim(),
      tool,
      priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
      successCriteria: String(task.successCriteria).trim(),
    };
  });

  if (!normalizedTasks.some((task) => task.tool === "web_search")) {
    throw new Error("Plan must include at least one web_search task");
  }

  if (normalizedTasks[normalizedTasks.length - 1].tool !== "llm") {
    throw new Error("Final task must use llm");
  }

  return {
    goal: String(plan.goal || fallbackGoal).trim(),
    domain: String(plan.domain || inferDomain(fallbackGoal)).trim(),
    planning_strategy: String(plan.planning_strategy || "market_entry_research").trim(),
    source: "gemini-2.5-flash",
    tasks: normalizedTasks,
  };
}

async function planWithGemini(goal) {
  const systemInstruction = `You are a Planner inside an Agent Harness for vertical industry research.
Do not answer the user's research question directly.
Decompose the user's goal into 3-5 executable subtasks.
Each subtask must be specific, observable, and evaluable.

Allowed tools:
- web_search: use for market facts, competitor evidence, pricing, user pain points, trends
- llm: use for synthesis, reasoning, prioritization, final recommendation
- calculator: use for simple numeric estimation, market sizing, conversion, unit economics

Return valid JSON only.`;

  const prompt = `User research goal:
${goal}

Create a task plan using this schema:
{
  "goal": "string",
  "domain": "string",
  "planning_strategy": "market_entry_research | competitor_research | user_research | product_positioning",
  "tasks": [
    {
      "id": 1,
      "task": "string",
      "objective": "string",
      "tool": "web_search | llm | calculator",
      "priority": "high | medium | low",
      "successCriteria": "string"
    }
  ]
}

Planning rules:
1. Generate 3-5 tasks.
2. Put external evidence tasks before synthesis tasks.
3. Use web_search for facts and evidence.
4. Use llm only for synthesis or final judgment.
5. Use calculator only when numeric estimation is explicitly useful.
6. Every task must have a measurable successCriteria.
7. The final task must use tool "llm".`;

  const { text } = await callGemini({
    prompt,
    systemInstruction,
    json: true,
    temperature: 0.2,
  });

  return validatePlan(extractJson(text), goal);
}

function routeTool(task) {
  const requestedTool = task.tool;
  const policy = toolPolicies[requestedTool];

  if (!policy) {
    return {
      taskId: task.id,
      tool: "llm",
      label: toolPolicies.llm.label,
      status: "fallback",
      reason: `Planner requested unknown tool "${requestedTool}", so Router fell back to LLM Reasoning.`,
      guardrail: "unknown_tool_blocked",
      allowedFor: toolPolicies.llm.allowedFor,
    };
  }

  return {
    taskId: task.id,
    tool: requestedTool,
    label: policy.label,
    status: "approved",
    reason: policy.reason,
    guardrail: `max ${policy.maxCalls} call(s) per harness run`,
    allowedFor: policy.allowedFor,
  };
}

function renderPlannerOutput(plan) {
  els.plannerOutput.textContent = JSON.stringify(plan, null, 2);
}

function executeToolDemo(task, route, attempt) {
  if (route.tool === "web_search") {
    const taskWeight = typeof task.id === "number" ? task.id : 2;
    const evidence =
      task.type === "repair"
        ? {
            query: "AI customer service SaaS pricing Intercom Zendesk Ada Gorgias",
            title: "补充竞品价格证据：按坐席、解决量与 AI 功能包计价并存",
            source: "Repair Search",
            insight:
              "竞品常见计费方式包括按坐席、按自动解决量、按 AI Agent 功能包或工单量分层，新进入者可用垂直模板和可观测质检降低替换成本。",
          }
        : marketEvidence[(task.id + attempt - 1) % marketEvidence.length];
    return {
      tool: route.tool,
      latency: 1.6 + taskWeight * 0.35 + attempt * 0.3,
      resultCount: task.type === "repair" ? 4 : attempt === 0 && task.id === 2 ? 2 : 5,
      evidence,
      summary: evidence.insight,
      source: "demo",
    };
  }

  return {
    tool: route.tool,
    latency: 2.1,
    resultCount: 1,
    evidence: {
      title: "Synthesis",
      source: "LLM",
      insight: "综合证据后给出市场进入判断、目标客群和产品策略。",
    },
    summary: "结合需求、竞品和商业模式形成进入建议。",
    source: "demo",
  };
}

function parseGroundingEvidence(task, text, groundingMetadata) {
  const chunks = groundingMetadata?.groundingChunks || [];
  const queries = groundingMetadata?.webSearchQueries || [];
  const sources = chunks
    .map((chunk) => chunk?.web)
    .filter(Boolean)
    .slice(0, 5)
    .map((web) => ({
      title: web.title || "Web Source",
      url: web.uri || "",
    }));

  const firstSource = sources[0];
  return {
    query: queries[0] || task.task,
    title: firstSource?.title || `Gemini grounded research: ${task.task}`,
    source: firstSource?.url || "Gemini Google Search Grounding",
    insight: text || "No grounded summary returned.",
    sources,
    queries,
  };
}

async function searchWithGemini(task) {
  const started = performance.now();
  const prompt = `You are the web_search executor inside a vertical research Agent Harness.

Research task:
${task.task}

Objective:
${task.objective || ""}

Success criteria:
${task.successCriteria || ""}

Use Google Search to gather current, concrete evidence.
Return a concise Chinese research brief with:
1) key findings
2) named competitors or market facts when available
3) pricing / business model clues if relevant
4) remaining uncertainties

Prefer specific numbers, product names, and sources over generic advice.`;

  const { text, groundingMetadata } = await callGemini({
    prompt,
    useSearch: true,
    temperature: 0.2,
  });

  const evidence = parseGroundingEvidence(task, text, groundingMetadata);
  return {
    tool: "web_search",
    latency: (performance.now() - started) / 1000,
    resultCount: Math.max(evidence.sources.length, evidence.queries.length, 1),
    evidence,
    summary: evidence.insight,
    source: "gemini-grounding",
  };
}

async function reasonWithGemini(task, observations) {
  const started = performance.now();
  const evidenceText = observations
    .map((item, index) => {
      const ev = item.result?.evidence || {};
      return `Observation ${index + 1}
Task: ${item.task?.task || ""}
Title: ${ev.title || ""}
Insight: ${ev.insight || item.result?.summary || ""}
Sources: ${(ev.sources || []).map((s) => s.title || s.url).join(" | ")}`;
    })
    .join("\n\n");

  const prompt = `You are the llm reasoning tool inside a research Agent Harness.
Do not write the final full report yet. Produce an intermediate synthesis note in Chinese.

Current task:
${task.task}

Objective:
${task.objective || ""}

Collected evidence:
${evidenceText || "No prior observations."}

Return:
- temporary conclusion
- strongest evidence
- remaining gaps`;

  const { text } = await callGemini({
    prompt,
    temperature: 0.3,
  });

  return {
    tool: "llm",
    latency: (performance.now() - started) / 1000,
    resultCount: 1,
    evidence: {
      title: "Gemini intermediate synthesis",
      source: "Gemini 2.5 Flash",
      insight: text,
    },
    summary: text,
    source: "gemini",
  };
}

async function executeTool(task, route, attempt, observations) {
  if (!canUseLiveMode()) {
    return executeToolDemo(task, route, attempt);
  }

  try {
    if (route.tool === "web_search") {
      return await searchWithGemini(task);
    }
    if (route.tool === "llm") {
      return await reasonWithGemini(task, observations);
    }
    return executeToolDemo(task, route, attempt);
  } catch (error) {
    await addTrace(
      "executor",
      "Live tool failed, fallback to demo",
      escapeHtml(error.message || String(error)),
      "!",
      80,
    );
    return executeToolDemo(task, route, attempt);
  }
}

function synthesizeDemo(goal, plan, observations, attempt) {
  const safeGoal = escapeHtml(goal);
  const competitorDepth =
    attempt === 0
      ? "竞品价格信息仍偏粗，需要补充 Intercom、Zendesk、Ada 等方案的包装和计价口径。"
      : "竞品侧已补充按解决量、坐席数、AI agent 功能包等常见计价口径，可支持更稳的定位判断。";
  const recommendation =
    attempt === 0
      ? "谨慎进入，先补足竞品证据。"
      : "值得以垂直行业切口进入，但不建议做通用客服机器人。";

  return {
    html: `
      <h3>01 市场机会</h3>
      <p>${safeGoal} 的核心机会来自客服成本压力、响应时效要求和知识库自动化。更强的购买动机来自高咨询量、高标准化、高客诉风险的行业。</p>
      <ul>
        <li>优先客群：跨境电商、B2B SaaS、金融科技、在线教育和本地生活平台。</li>
        <li>高价值场景：售前咨询、订单状态、退款政策、账号问题、工单分流和质检复盘。</li>
      </ul>

      <h3>02 用户痛点</h3>
      <p>用户不再满足于“能聊天”，而是要求结果可控、证据可追溯、能接入业务系统，并且能在低置信度时稳定转人工。</p>

      <h3>03 核心竞品</h3>
      <p>Intercom、Zendesk、Ada、Gorgias 等产品已经覆盖通用客服自动化，新团队需要避开纯横向竞争。${competitorDepth}</p>

      <h3>04 进入建议</h3>
      <p>${recommendation} 可把产品定位为“行业客服 Agent Harness”：内置任务拆解、工具路由、回答追踪、质检评分和自动补证据，帮助客户看到 AI 客服为什么这么答、答得好不好、何时需要修复。</p>
    `,
    text: `Demo synthesis for ${goal}`,
    observations,
    taskCount: plan.tasks.length,
    source: "demo",
  };
}

function markdownishToHtml(text) {
  const escaped = escapeHtml(text || "");
  const blocks = escaped.split(/\n{2,}/).filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => /^[-*•]\s+/.test(line.trim()) || !line.trim())) {
        const items = lines
          .filter((line) => line.trim())
          .map((line) => `<li>${line.replace(/^[-*•]\s+/, "")}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      if (/^\d+\.\s+/.test(lines[0].trim()) && lines.length === 1) {
        return `<h3>${lines[0].replace(/^\d+\.\s+/, "")}</h3>`;
      }

      if (/^(#{1,3}\s+|0\d\s)/.test(lines[0].trim()) || /^(市场|用户|竞品|进入|结论|建议)/.test(lines[0])) {
        return `<h3>${lines[0].replace(/^#+\s*/, "")}</h3>${
          lines.length > 1 ? `<p>${lines.slice(1).join("<br>")}</p>` : ""
        }`;
      }

      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

async function synthesizeWithGemini(goal, plan, observations, attempt) {
  const evidenceText = observations
    .map((item, index) => {
      const ev = item.result?.evidence || {};
      const sourceList = (ev.sources || [])
        .map((source) => `- ${source.title || "source"}: ${source.url || ""}`)
        .join("\n");
      return `[${index + 1}] Task: ${item.task?.task}
Title: ${ev.title || ""}
Insight:
${ev.insight || item.result?.summary || ""}
Sources:
${sourceList || ev.source || "n/a"}`;
    })
    .join("\n\n");

  const prompt = `You are the Synthesizer in a vertical research Agent Harness.

User goal:
${goal}

Plan domain:
${plan.domain}

Attempt:
${attempt + 1}

Evidence pool:
${evidenceText}

Write a concise Chinese research report with these sections:
01 市场机会
02 用户痛点
03 核心竞品
04 进入建议

Requirements:
- Be specific and evidence-based.
- Mention uncertainties explicitly.
- If evidence about pricing/competitors is thin, say so clearly.
- End with a clear go / cautious / no-go style recommendation.`;

  const { text } = await callGemini({
    prompt,
    temperature: 0.4,
  });

  return {
    html: markdownishToHtml(text),
    text,
    observations,
    taskCount: plan.tasks.length,
    source: "gemini-2.5-flash",
  };
}

function evaluateDemo(plan, synthesis, attempt) {
  const completedTasks = synthesis.observations.length;
  const expectedTasks = plan.tasks.length;
  const completeness = Math.min(5, Math.round((completedTasks / expectedTasks) * 5));
  const evidence = attempt === 0 ? 3 : 4;
  const relevance = 5;
  const overall = Math.round((completeness * 0.35 + evidence * 0.4 + relevance * 0.25) * 20);

  return {
    completeness,
    evidence,
    relevance,
    overall,
    threshold: 80,
    decision: overall >= 80 ? "pass" : "retry",
    rubric: [
      {
        key: "completeness",
        label: "Completeness",
        score: completeness,
        reason: `完成 ${completedTasks}/${expectedTasks} 个 Planner 子任务，覆盖市场机会、用户痛点、竞品和进入建议。`,
      },
      {
        key: "evidence",
        label: "Evidence",
        score: evidence,
        reason:
          attempt === 0
            ? "已有市场和用户证据，但竞品价格、计费方式信息不足。"
            : "补充了竞品计价口径，证据足以支撑进入判断。",
      },
      {
        key: "relevance",
        label: "Relevance",
        score: relevance,
        reason: "最终输出紧扣是否值得进入，并给出目标客群、产品切口和主要风险。",
      },
    ],
    issues:
      attempt === 0
        ? ["竞品分析证据不足", "缺少价格与计费方式信息"]
        : ["建议结合最新公开资料持续更新证据"],
    repairTask:
      attempt === 0
        ? {
            task: `补充 ${plan.domain} 竞品价格与计费方式证据`,
            tool: "web_search",
            reason: "Evidence score below threshold",
          }
        : null,
    source: "demo",
  };
}

function normalizeEvaluation(raw, plan, synthesis) {
  const clamp = (value, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.min(5, Math.round(num)));
  };

  const completeness = clamp(raw.completeness, 3);
  const evidence = clamp(raw.evidence, 3);
  const relevance = clamp(raw.relevance, 4);
  const overall = Math.round((completeness * 0.35 + evidence * 0.4 + relevance * 0.25) * 20);
  const decision = overall >= 80 ? "pass" : "retry";
  const issues = Array.isArray(raw.issues)
    ? raw.issues.map(String).filter(Boolean)
    : decision === "retry"
      ? ["Evidence or completeness below threshold"]
      : [];

  let repairTask = null;
  if (decision === "retry") {
    repairTask = {
      task:
        raw?.repairTask?.task ||
        `补充 ${plan.domain} 的关键证据缺口：竞品、价格或用户验证信息`,
      tool: "web_search",
      reason: raw?.repairTask?.reason || "Score below threshold",
    };
  }

  const defaultRubric = [
    {
      key: "completeness",
      label: "Completeness",
      score: completeness,
      reason: raw?.rubric?.completeness || `覆盖 ${synthesis.observations.length}/${plan.tasks.length} 个研究任务。`,
    },
    {
      key: "evidence",
      label: "Evidence",
      score: evidence,
      reason: raw?.rubric?.evidence || "根据证据充分程度评分。",
    },
    {
      key: "relevance",
      label: "Relevance",
      score: relevance,
      reason: raw?.rubric?.relevance || "根据是否直接回答原始研究问题评分。",
    },
  ];

  return {
    completeness,
    evidence,
    relevance,
    overall,
    threshold: 80,
    decision,
    rubric: defaultRubric,
    issues: issues.length ? issues : decision === "pass" ? ["无明显阻断性问题"] : ["需要补充证据"],
    repairTask,
    source: "gemini-2.5-flash",
  };
}

async function evaluateWithGemini(goal, plan, synthesis, attempt) {
  const prompt = `You are the Evaluator in a vertical research Agent Harness.

Score the research output with this rubric:
- completeness (0-5): whether planner tasks are covered
- evidence (0-5): whether claims are supported by concrete evidence
- relevance (0-5): whether the output answers the original goal

Original goal:
${goal}

Plan tasks:
${plan.tasks.map((task) => `- ${task.task} [${task.tool}]`).join("\n")}

Research output:
${synthesis.text || ""}

Evidence count:
${synthesis.observations.length}

Attempt:
${attempt + 1}

Return JSON only:
{
  "completeness": 0-5,
  "evidence": 0-5,
  "relevance": 0-5,
  "issues": ["string"],
  "rubric": {
    "completeness": "reason",
    "evidence": "reason",
    "relevance": "reason"
  },
  "repairTask": {
    "task": "specific web_search repair task",
    "reason": "why this repair is needed"
  }
}

Rules:
- If evidence about competitors/pricing/sources is thin, keep evidence <= 3.
- If overall quality is already strong, set high scores and repairTask can be null.
- repairTask.task must be a concrete search task in Chinese.`;

  const { text } = await callGemini({
    prompt,
    json: true,
    temperature: 0.1,
  });

  return normalizeEvaluation(extractJson(text), plan, synthesis);
}

function renderEvaluationReport(evaluation) {
  els.evaluationDecision.textContent =
    evaluation.decision === "pass" ? `Pass ${evaluation.overall}` : `Retry ${evaluation.overall}`;
  els.evaluationReport.innerHTML = evaluation.rubric
    .map(
      (item) => `
        <div class="rubric-item">
          <div class="rubric-head">
            <strong>${item.label}</strong>
            <span class="rubric-score">${item.score}/5</span>
          </div>
          <div class="rubric-bar">
            <div class="rubric-fill" style="--score-width: ${(item.score / 5) * 100}%"></div>
          </div>
          <p>${escapeHtml(item.reason)}</p>
        </div>
      `,
    )
    .join("");
}

async function runTask(task, attempt, observations) {
  const route = routeTool(task);
  await addTrace(
    "router",
    route.label,
    `Task ${task.id}: ${escapeHtml(task.task)}<br>Status: ${route.status}<br>Policy: ${escapeHtml(route.reason)}<br>Guardrail: ${escapeHtml(route.guardrail)}`,
    "→",
  );
  const result = await executeTool(task, route, attempt, observations);
  const sourceNote = result.source && result.source !== "demo" ? `<br>Source: ${escapeHtml(result.source)}` : "";
  await addTrace(
    "executor",
    "Observation captured",
    `${escapeHtml(result.evidence.title)}<br>${result.resultCount} result(s), ${result.latency.toFixed(1)}s${sourceNote}`,
    "✓",
  );

  return { task, route, result };
}

async function runRepairTask(repairTask, attempt, observations) {
  const task = {
    id: `R${attempt}`,
    type: "repair",
    task: repairTask.task,
    objective: "补齐 Evaluator 发现的证据缺口",
    tool: repairTask.tool || "web_search",
    priority: "high",
    successCriteria: "补充竞品、价格、计费或定位证据，使 Evidence 分数达到阈值",
  };

  await addTrace(
    "retry",
    "Repair task created",
    `Task ${task.id}: ${escapeHtml(task.task)}<br>Reason: ${escapeHtml(repairTask.reason || "")}`,
    "↻",
  );

  return runTask(task, attempt, observations);
}

function updateMetrics(run) {
  els.toolCalls.textContent = String(run.toolCalls);
  els.latency.textContent = `${Number(run.latency || 0).toFixed(1)}s`;
  els.retryCount.textContent = String(run.retryCount);
  els.quality.textContent = String(run.evaluation.overall);
  els.evidence.textContent = `${run.evaluation.evidence}/5`;
  els.completeness.textContent = `${run.evaluation.completeness}/5`;
  els.scoreChip.textContent = `Score ${run.evaluation.overall}`;
}

async function createPlan(goal) {
  if (!canUseLiveMode()) {
    return planTask(goal);
  }

  try {
    await addTrace("planner", "Calling Gemini Planner", "model: gemini-2.5-flash", "•", 60);
    return await planWithGemini(goal);
  } catch (error) {
    await addTrace(
      "planner",
      "Gemini Planner failed, fallback to demo plan",
      escapeHtml(error.message || String(error)),
      "!",
      80,
    );
    return planTask(goal);
  }
}

async function createSynthesis(goal, plan, observations, attempt) {
  if (!canUseLiveMode()) {
    return synthesizeDemo(goal, plan, observations, attempt);
  }

  try {
    return await synthesizeWithGemini(goal, plan, observations, attempt);
  } catch (error) {
    await addTrace(
      "synthesizer",
      "Gemini Synthesizer failed, fallback to demo",
      escapeHtml(error.message || String(error)),
      "!",
      80,
    );
    return synthesizeDemo(goal, plan, observations, attempt);
  }
}

async function createEvaluation(goal, plan, synthesis, attempt) {
  if (!canUseLiveMode()) {
    return evaluateDemo(plan, synthesis, attempt);
  }

  try {
    return await evaluateWithGemini(goal, plan, synthesis, attempt);
  } catch (error) {
    await addTrace(
      "evaluator",
      "Gemini Evaluator failed, fallback to demo",
      escapeHtml(error.message || String(error)),
      "!",
      80,
    );
    return evaluateDemo(plan, synthesis, attempt);
  }
}

async function runHarness() {
  const startedAt = performance.now();
  const goal = els.task.value.trim() || "分析 AI 客服 SaaS 市场是否值得进入";
  state.traceItems = [];
  state.runStartedAt = startedAt;
  els.run.disabled = true;
  els.status.classList.add("running");
  els.status.lastChild.textContent = " Running";
  els.output.innerHTML =
    "<h3>Harness running</h3><p>正在拆解任务、路由工具并收集执行证据。</p>";
  renderTrace();
  updateModeBadge();

  const modeLabel = canUseLiveMode()
    ? "Live Mode via shared proxy: Gemini 2.5 Flash + Google Search Grounding"
    : "Demo Mode: local rule-based simulation";
  await addTrace("system", "Harness mode", modeLabel, "•", 60);

  await addTrace("planner", "Planning started", "Planner receives the user research goal.", "•", 80);
  const plan = await createPlan(goal);
  renderPlannerOutput(plan);
  await addTrace(
    "planner",
    "Plan generated",
    `Generated ${plan.tasks.length} subtasks for: ${escapeHtml(plan.goal)}<br>Source: ${escapeHtml(plan.source || "demo_rules")}`,
    "✓",
  );

  let retryCount = 0;
  let toolCalls = 0;
  const observations = [];
  let evaluation;
  let synthesis;

  for (const task of plan.tasks) {
    const observation = await runTask(task, 0, observations);
    toolCalls += 1;
    observations.push(observation);
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await addTrace(
      "synthesizer",
      "Synthesizing",
      canUseLiveMode()
        ? "Gemini merges evidence into a structured research output."
        : "Evidence pool merged into a structured research output.",
      "◇",
    );
    synthesis = await createSynthesis(plan.goal, plan, observations, attempt);
    els.output.innerHTML = synthesis.html;

    await addTrace(
      "evaluator",
      "Evaluating",
      canUseLiveMode()
        ? "Gemini scores Completeness, Evidence and Relevance."
        : "Completeness, Evidence and Relevance scored by evaluator.",
      "◎",
    );
    evaluation = await createEvaluation(plan.goal, plan, synthesis, attempt);
    renderEvaluationReport(evaluation);
    await addTrace(
      "evaluator",
      "Evaluation score",
      `Score ${evaluation.overall}/100<br>Decision: ${evaluation.decision}<br>Issues: ${escapeHtml(evaluation.issues.join("；"))}<br>Source: ${escapeHtml(evaluation.source || "demo")}`,
      evaluation.overall >= 80 ? "✓" : "!",
    );

    if (evaluation.overall >= 80 || !evaluation.repairTask) {
      break;
    }

    retryCount += 1;
    const repairObservation = await runRepairTask(evaluation.repairTask, attempt + 1, observations);
    toolCalls += 1;
    observations.push(repairObservation);
  }

  const latency = (performance.now() - startedAt) / 1000;
  state.lastRun = {
    task: plan.goal,
    score: evaluation.overall,
    retryCount,
    toolCalls,
    latency,
    evaluation,
    mode: canUseLiveMode() ? "live" : "demo",
    timestamp: new Date().toISOString(),
  };

  updateMetrics(state.lastRun);
  await addTrace(
    "complete",
    "Completed",
    `Final score ${evaluation.overall}; retry count ${retryCount}; mode ${state.lastRun.mode}.`,
    "✓",
    80,
  );
  els.run.disabled = false;
  els.status.classList.remove("running");
  els.status.lastChild.textContent = " Ready";
}

function resetHarness() {
  state.traceItems = [];
  state.lastRun = null;
  state.runStartedAt = null;
  els.trace.innerHTML = '<li class="empty-state">Run a task to inspect the harness chain.</li>';
  els.output.innerHTML =
    "<h3>等待运行</h3><p>输入一个垂直行业研究问题，Harness 会完成 Plan → Route → Execute → Observe → Evaluate → Retry 的闭环。</p>";
  els.plannerOutput.textContent = "Run a task to inspect the structured plan.";
  els.evaluationDecision.textContent = "Pending";
  els.evaluationReport.innerHTML =
    '<div class="empty-state">Run a task to inspect quality rubric scores.</div>';
  els.scoreChip.textContent = "Score --";
  updateMetrics({
    toolCalls: 0,
    latency: 0,
    retryCount: 0,
    evaluation: { overall: "--", evidence: "--", completeness: "--" },
  });
}

function exportTrace() {
  const trace = {
    exportedAt: new Date().toISOString(),
    run: state.lastRun,
    trace: state.traceItems,
  };
  const blob = new Blob([JSON.stringify(trace, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "execution-trace.json";
  link.click();
  URL.revokeObjectURL(url);
}

function getFeedbackRows() {
  return JSON.parse(localStorage.getItem("insightHarnessFeedback") || "[]");
}

function saveFeedback(row) {
  const rows = getFeedbackRows();
  rows.push(row);
  localStorage.setItem("insightHarnessFeedback", JSON.stringify(rows));
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportFeedback() {
  const rows = getFeedbackRows();
  const header = ["timestamp", "task", "score", "retry_count", "usefulness", "feedback"];
  const csv = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.timestamp,
        row.task,
        row.score,
        row.retry_count,
        row.usefulness,
        row.feedback,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "feedback.csv";
  link.click();
  URL.revokeObjectURL(url);
}

els.run.addEventListener("click", () => {
  runHarness().catch(async (error) => {
    els.run.disabled = false;
    els.status.classList.remove("running");
    els.status.lastChild.textContent = " Ready";
    els.output.innerHTML = `<h3>运行失败</h3><p>${escapeHtml(error.message || String(error))}</p>`;
    await addTrace("system", "Run failed", escapeHtml(error.message || String(error)), "!", 40);
  });
});
els.reset.addEventListener("click", resetHarness);
els.exportTrace.addEventListener("click", exportTrace);
els.exportFeedback.addEventListener("click", exportFeedback);
els.liveModeToggle.addEventListener("change", () => {
  if (els.liveModeToggle.checked && !hasLiveCredential()) {
    els.liveModeToggle.checked = false;
    alert("Proxy 未就绪。请先部署 worker/，并在 config.public.js 填写 proxyUrl。");
  }
  sessionStorage.setItem(STORAGE_KEYS.liveMode, els.liveModeToggle.checked ? "1" : "0");
  updateModeBadge();
});

els.feedbackChoices.forEach((button) => {
  button.addEventListener("click", () => {
    els.feedbackChoices.forEach((choice) => choice.classList.remove("active"));
    button.classList.add("active");
    state.selectedFeedback = button.dataset.value;
  });
});

els.feedbackForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const run = state.lastRun;
  saveFeedback({
    timestamp: new Date().toISOString(),
    task: run?.task || els.task.value,
    score: run?.score || "",
    retry_count: run?.retryCount || 0,
    usefulness: state.selectedFeedback,
    feedback: els.feedbackText.value,
  });
  els.feedbackText.value = "";
  els.feedbackText.placeholder = "Feedback saved. Add another note if needed.";
});

initConfigUi();
