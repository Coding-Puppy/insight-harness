// Preferred models for this project's API key profile:
// - gemini-2.5-flash is blocked for many new keys
// - free-tier quotas are per-model, so fallback helps when one model is rate-limited
const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-3.5-flash-lite",
];

// Simple in-memory rate limit (resets when the isolate recycles).
const rateBuckets = new Map();
const RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  maxRequests: 40,
};

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const allowOrigin =
    allowed.includes("*") || !origin
      ? "*"
      : allowed.includes(origin)
        ? origin
        : allowed[0] || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin, env),
    },
  });
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT.windowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT.windowMs;
  }

  bucket.count += 1;
  rateBuckets.set(ip, bucket);

  return {
    allowed: bucket.count <= RATE_LIMIT.maxRequests,
    remaining: Math.max(0, RATE_LIMIT.maxRequests - bucket.count),
    resetAt: bucket.resetAt,
  };
}

function buildGeminiBody(input) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) {
    throw new Error("prompt is required");
  }
  if (prompt.length > 20000) {
    throw new Error("prompt is too long");
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
  };

  // Keep generationConfig minimal for Gemini 3.x compatibility.
  if (input.json) {
    body.generationConfig = {
      responseMimeType: "application/json",
    };
  }

  if (input.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: String(input.systemInstruction) }],
    };
  }

  if (input.useSearch) {
    body.tools = [{ google_search: {} }];
  }

  return body;
}

function getResponseText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function shouldTryNextModel(status, message) {
  const text = String(message || "").toLowerCase();
  // Only fall back when the model itself is unavailable.
  // Do NOT fall back on 429/quota errors — that would burn the free tier faster.
  if (status === 404) return true;
  if (text.includes("no longer available")) return true;
  if (text.includes("not found") && text.includes("model")) return true;
  return false;
}

async function callGeminiModel(apiKey, model, geminiBody) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const upstream = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiBody),
  });
  const payload = await upstream.json().catch(() => ({}));
  return { upstream, payload, model };
}

async function handleGemini(request, env, origin) {
  if (!env.GEMINI_API_KEY) {
    return jsonResponse(
      { error: "Server missing GEMINI_API_KEY. Set it with: npx wrangler secret put GEMINI_API_KEY" },
      500,
      origin,
      env,
    );
  }

  const ip = getClientIp(request);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return jsonResponse(
      {
        error: "Rate limit exceeded. Please try again later.",
        remaining: rate.remaining,
        resetAt: rate.resetAt,
      },
      429,
      origin,
      env,
    );
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin, env);
  }

  let geminiBody;
  try {
    geminiBody = buildGeminiBody(input);
  } catch (error) {
    return jsonResponse({ error: error.message || String(error) }, 400, origin, env);
  }

  const attempts = [];
  let lastError = null;
  let lastStatus = 500;

  for (const model of GEMINI_MODELS) {
    const { upstream, payload } = await callGeminiModel(env.GEMINI_API_KEY, model, geminiBody);
    if (upstream.ok) {
      return jsonResponse(
        {
          text: getResponseText(payload),
          groundingMetadata: payload?.candidates?.[0]?.groundingMetadata || null,
          payload,
          meta: {
            model,
            tried: attempts.concat(model),
            remaining: rate.remaining,
          },
        },
        200,
        origin,
        env,
      );
    }

    const message = payload?.error?.message || `Gemini API error (${upstream.status})`;
    attempts.push({ model, status: upstream.status, message });
    lastError = message;
    lastStatus = upstream.status;

    if (!shouldTryNextModel(upstream.status, message)) {
      break;
    }
  }

  return jsonResponse(
    {
      error: lastError || "All Gemini models failed",
      status: lastStatus,
      tried: attempts,
    },
    lastStatus || 500,
    origin,
    env,
  );
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse(
        {
          ok: true,
          service: "insight-harness-proxy",
          models: GEMINI_MODELS,
          primaryModel: GEMINI_MODELS[0],
          hasKey: Boolean(env.GEMINI_API_KEY),
        },
        200,
        origin,
        env,
      );
    }

    if (request.method === "POST" && (url.pathname === "/api/gemini" || url.pathname === "/")) {
      return handleGemini(request, env, origin);
    }

    return jsonResponse({ error: "Not found" }, 404, origin, env);
  },
};
