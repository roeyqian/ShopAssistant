const PROVIDER_TIMEOUT_MS = 30_000;
const MAX_HTTP_RETRIES = 3;
const HTTP_RETRY_DELAY_MS = 350;
const MAX_EMPTY_RESPONSE_RETRIES = 2;
const MAX_LENGTH_CONTINUATIONS = 2;
const DEFAULT_MAX_TOKENS = 10_000;
const RECOVERY_MAX_TOKENS = 10_000;
const EMPTY_RESPONSE_RETRY_PROMPT = 'Your previous response contained no user-visible text. Reply now with one complete, user-facing answer. Do not return an empty response.';
const CONTINUE_RESPONSE_PROMPT = 'Continue the answer exactly where it stopped. Do not repeat earlier text. Complete the user-facing answer now.';

export async function completeDeepSeek(config, systemPrompt, messageHistory, userMessage, options = {}) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...messageHistory,
    { role: 'user', content: userMessage },
  ];
  let requestMessages = messages;
  let maxTokens = DEFAULT_MAX_TOKENS;
  let content = '';
  let emptyRetries = 0;
  let lengthContinuations = 0;

  while (true) {
    const response = await postDeepSeek(config, {
      model: config.deepseek_model || 'deepseek-chat',
      messages: requestMessages,
      temperature: 0.7,
      max_tokens: maxTokens,
      stream: false,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }, options);
    const result = await readDeepSeekCompletion(response);
    content += result.content;

    if (result.finishReason === 'length' && lengthContinuations < MAX_LENGTH_CONTINUATIONS) {
      lengthContinuations += 1;
      maxTokens = RECOVERY_MAX_TOKENS;
      requestMessages = result.content.trim()
        ? [
            ...messages,
            { role: 'assistant', content },
            { role: 'user', content: CONTINUE_RESPONSE_PROMPT },
          ]
        : [...messages, { role: 'user', content: EMPTY_RESPONSE_RETRY_PROMPT }];
      continue;
    }

    if (content.trim()) return { content, finishReason: result.finishReason };
    if (emptyRetries >= MAX_EMPTY_RESPONSE_RETRIES) {
      throw { status: 502, message: 'AI service returned an empty response' };
    }

    emptyRetries += 1;
    maxTokens = RECOVERY_MAX_TOKENS;
    requestMessages = [...messages, { role: 'user', content: EMPTY_RESPONSE_RETRY_PROMPT }];
  }
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
  for (let retry = 0; retry <= MAX_HTTP_RETRIES; retry += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), PROVIDER_TIMEOUT_MS);
    const abortFromCaller = () => controller.abort('cancelled');
    signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const response = await fetch(`${normalizeBaseUrl(config.deepseek_base_url)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.deepseek_api_key}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) return response;

      lastHttpError = {
        status: response.status,
        message: await readProviderError(response),
        httpError: true,
      };
      if (retry === MAX_HTTP_RETRIES) throw lastHttpError;
    } catch (error) {
      if (controller.signal.aborted) {
        const cancelled = controller.signal.reason === 'cancelled';
        throw {
          status: cancelled ? 499 : 504,
          message: cancelled ? 'AI request cancelled' : 'AI service timed out',
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
        };
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
    }

    await delay(HTTP_RETRY_DELAY_MS * (retry + 1));
  }

  throw lastHttpError || { status: 502, message: 'AI service error' };
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

async function readProviderError(response) {
  const text = await response.text();
  if (!text) return `AI service returned HTTP ${response.status}`;

  try {
    const data = JSON.parse(text);
    const message = data?.error?.message || data?.message || text;
    return `AI service returned HTTP ${response.status}: ${String(message).slice(0, 240)}`;
  } catch {
    return `AI service returned HTTP ${response.status}: ${text.slice(0, 240)}`;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
