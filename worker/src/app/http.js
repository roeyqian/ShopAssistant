// HTTP工具函数 - 复用AgentIS架构
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-max-age": "86400",
};

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function createRouter() {
  const routes = [];

  return {
    add(method, pattern, handler) {
      routes.push({ method: method.toUpperCase(), ...compilePattern(pattern), handler });
    },

    async handle(request, env, url, context = {}) {
      const matched = routes.find((candidate) => {
        if (candidate.method !== request.method.toUpperCase()) return false;
        return candidate.expression.test(url.pathname);
      });

      if (!matched) return json({ error: "API not found" }, 404);

      const match = url.pathname.match(matched.expression);
      const params = Object.fromEntries(
        matched.names.map((name, index) => [name, decodeURIComponent(match[index + 1])]),
      );
      return matched.handler({ request, env, url, params, ...context });
    },
  };
}

export async function handleApi(request, env, url, router, context = {}) {
  if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

  const requestId = createId("req");
  try {
    const response = await router.handle(request, env, url, { ...context, requestId });
    return withCors(response, { "x-request-id": requestId });
  } catch (error) {
    const status = getErrorStatus(error);
    const message = getErrorMessage(error);
    const safeMessage = sanitizeErrorMessage(message);

    if (status >= 500) {
      console.error("API error", {
        requestId,
        method: request.method,
        path: url.pathname,
        status,
        message,
        stack: error?.stack,
      });
    }

    const payload = {
      error: status >= 500 ? "Server error" : safeMessage,
      requestId,
    };
    if (status >= 500 && safeMessage) payload.detail = safeMessage;
    const diagnostic = sanitizeErrorDiagnostic(error?.diagnostic);
    if (diagnostic) payload.diagnostic = diagnostic;

    return withCors(
      json(payload, status, { "x-request-id": requestId }),
    );
  }
}

export async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function compilePattern(pattern) {
  const names = [];
  const source = pattern.split("/").map((segment) => {
    if (segment.startsWith(":")) {
      names.push(segment.slice(1));
      return "([^/]+)";
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  return { expression: new RegExp(`^${source}/?$`), names };
}

function withCors(response, extraHeaders = {}) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function getErrorStatus(error) {
  const status = Number(error?.status || error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function getErrorMessage(error) {
  if (typeof error === "string") return error;
  if (error?.message) return String(error.message);
  if (error?.cause?.message) return String(error.cause.message);
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== "{}" ? serialized : String(error);
  } catch {
    return String(error);
  }
}

function sanitizeErrorMessage(message) {
  return String(message || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/(authorization\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 500);
}

function sanitizeErrorDiagnostic(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const diagnostic = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' && Number.isFinite(item)) diagnostic[key] = item;
    else if (typeof item === 'boolean' || item === null) diagnostic[key] = item;
    else if (typeof item === 'string') diagnostic[key] = sanitizeErrorMessage(item).slice(0, 500);
  }
  return Object.keys(diagnostic).length ? diagnostic : null;
}

export function requireAuth(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw { status: 401, message: "Unauthorized" };
  }
  return authHeader.slice(7);
}

export async function getSession(sessionToken, env) {
  const sessionData = await env.kv.get(`session:${sessionToken}`);
  if (sessionData) {
    return JSON.parse(sessionData);
  }

  const record = await env.db.prepare(
    `SELECT s.session_id, s.user_id, s.expires_at, u.email, u.username, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_id = ?`
  ).bind(sessionToken).first();

  if (!record) {
    throw { status: 401, message: "Invalid session" };
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await revokeSession(sessionToken, env);
    throw { status: 401, message: "Session expired" };
  }

  const session = {
    userId: record.user_id,
    email: record.email,
    username: record.username,
    role: record.role,
  };

  const ttlSeconds = Math.max(60, Math.floor((new Date(record.expires_at).getTime() - Date.now()) / 1000));
  await env.kv.put(`session:${sessionToken}`, JSON.stringify(session), { expirationTtl: ttlSeconds });
  return session;
}

export async function persistSession(sessionToken, sessionData, env, ttlSeconds = SESSION_TTL_SECONDS) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  await Promise.all([
    env.kv.put(`session:${sessionToken}`, JSON.stringify(sessionData), { expirationTtl: ttlSeconds }),
    env.db.prepare(
      `INSERT OR REPLACE INTO sessions (session_id, user_id, expires_at, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind(sessionToken, sessionData.userId, expiresAt).run(),
  ]);

  return { ...sessionData, expiresAt };
}

export async function revokeSession(sessionToken, env) {
  await Promise.all([
    env.kv.delete(`session:${sessionToken}`),
    env.db.prepare("DELETE FROM sessions WHERE session_id = ?").bind(sessionToken).run(),
  ]);
}

export async function requireAdmin(request, env) {
  const token = requireAuth(request);
  const session = await getSession(token, env);
  if (session.role !== 'admin') {
    throw { status: 403, message: "Admin access required" };
  }
  return session;
}

export async function requireStandardUser(request, env) {
  const token = requireAuth(request);
  const session = await getSession(token, env);
  if (session.role === 'admin') {
    throw { status: 403, message: "Admin accounts are limited to research management" };
  }
  return { token, session };
}
