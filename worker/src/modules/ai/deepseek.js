const MAX_HTTP_RETRIES = 3;
const HTTP_RETRY_DELAY_MS = 350;

export async function completeDeepSeek(config, systemPrompt, messageHistory, userMessage, options = {}) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...messageHistory,
    { role: 'user', content: userMessage },
  ];
  const response = await postDeepSeek(config, {
    model: config.deepseek_model || 'deepseek-chat',
    messages,
    temperature: normalizeTemperature(config.ai_temperature),
    stream: false,
    ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
  }, options);
  const result = await readDeepSeekCompletion(response);
  if (!result.content.trim()) {
    throw { status: 502, stage: 'provider-response', message: 'AI service returned an empty response' };
  }
  return result;
}

export async function testDeepSeekConnection(config) {
  const response = await postDeepSeek(config, {
    model: config.deepseek_model || 'deepseek-chat',
    messages: [
      { role: 'system', content: 'Reply with exactly: ok' },
      { role: 'user', content: 'ping' },
    ],
    temperature: 0,
    max_tokens: 8,
  });
  const data = await response.json();

  return {
    ok: true,
    model: data.model || config.deepseek_model || 'deepseek-chat',
    response: String(data.choices?.[0]?.message?.content || ''),
  };
}

async function postDeepSeek(config, payload, { signal } = {}) {
  let lastHttpError;
  const startedAt = Date.now();
  for (let retry = 0; retry <= MAX_HTTP_RETRIES; retry += 1) {
    const diagnostic = requestDiagnostic(config, payload, retry, startedAt);

    try {
      const response = await fetch(`${normalizeBaseUrl(config.deepseek_base_url)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.deepseek_api_key}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      diagnostic.elapsedMs = Date.now() - startedAt;
      if (response.ok) return response;
      diagnostic.httpStatus = response.status;

      lastHttpError = {
        status: response.status,
        message: await readProviderError(response),
        httpError: true,
        stage: 'provider-http',
        diagnostic,
      };
      if (retry === MAX_HTTP_RETRIES) throw lastHttpError;
    } catch (error) {
      diagnostic.elapsedMs = Date.now() - startedAt;
      if (signal?.aborted) {
        throw {
          status: 499,
          stage: 'request-cancelled',
          message: 'AI request cancelled by the client',
          diagnostic,
        };
      }
      if (error?.httpError || error?.status) {
        lastHttpError = error;
        if (retry === MAX_HTTP_RETRIES) throw error;
      } else {
        throw {
          status: 502,
          stage: 'provider-connect',
          message: `AI service connection failed: ${String(error?.message || error)}`,
          diagnostic: { ...diagnostic, cause: String(error?.message || error).slice(0, 500) },
        };
      }
    }

    await delay(HTTP_RETRY_DELAY_MS * (retry + 1));
  }

  throw lastHttpError || { status: 502, message: 'AI service error' };
}

function requestDiagnostic(config, payload, retry, startedAt) {
  return {
    stage: 'provider-request',
    attempt: retry + 1,
    maxAttempts: MAX_HTTP_RETRIES + 1,
    elapsedMs: Date.now() - startedAt,
    baseUrl: safeBaseUrl(config.deepseek_base_url),
    model: String(config.deepseek_model || 'deepseek-chat'),
    messageCount: Array.isArray(payload.messages) ? payload.messages.length : 0,
    requestCharacters: JSON.stringify(payload).length,
    responseFormat: payload.response_format?.type || null,
  };
}

function safeBaseUrl(value) {
  try {
    const url = new URL(normalizeBaseUrl(value));
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return '[invalid base URL]';
  }
}

async function readDeepSeekCompletion(response) {
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw {
      status: 502,
      stage: 'provider-response',
      message: `AI service returned an invalid completion response: ${String(error?.message || error)}`,
    };
  }

  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string') {
    throw { status: 502, stage: 'provider-response', message: 'AI service returned a completion without text' };
  }
  return { content, finishReason: choice.finish_reason || null };
}

function normalizeBaseUrl(value) {
  return String(value || 'https://api.deepseek.com').replace(/\/+$/, '');
}

function normalizeTemperature(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(2, Math.max(0, number)) : 0.7;
}

async function readProviderError(response) {
  const text = await response.text();
  if (!text) return `AI service returned HTTP ${response.status}`;

  try {
    const data = JSON.parse(text);
    const message = data?.error?.message || data?.message || text;
    return `AI service returned HTTP ${response.status}: ${String(message).slice(0, 2_000)}`;
  } catch {
    return `AI service returned HTTP ${response.status}: ${text.slice(0, 2_000)}`;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
