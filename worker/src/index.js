const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

  // Gemini 3.x ignores/deprecates temperature; only set JSON mime when needed.
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

  const upstream = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiBody),
  });

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return jsonResponse(
      {
        error: payload?.error?.message || `Gemini API error (${upstream.status})`,
        status: upstream.status,
      },
      upstream.status,
      origin,
      env,
    );
  }

  return jsonResponse(
    {
      text: getResponseText(payload),
      groundingMetadata: payload?.candidates?.[0]?.groundingMetadata || null,
      payload,
      meta: {
        model: GEMINI_MODEL,
        remaining: rate.remaining,
      },
    },
    200,
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
          model: GEMINI_MODEL,
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
