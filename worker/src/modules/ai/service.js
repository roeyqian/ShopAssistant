import { json, readJsonBody, requireStandardUser, createId } from "../../app/http.js";
import { streamDeepSeek } from "./deepseek.js";
import { getSellerPrompt } from "./seller.js";
import { getGuardianPrompt } from "./guardian.js";
import { getLocaleFromRequest, normalizeProduct } from "../shop/utils.js";

const HIDDEN_METADATA_KEY = 'hiddenFromUser';
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_AI_REQUESTS_PER_MINUTE = 12;
const HISTORY_LIMIT = 20;
const MAX_CONSECUTIVE_AUTOMATIC_PROMOTIONS = 3;
const HISTORY_ORDER_DESC = `
    ORDER BY timestamp DESC,
      CASE role WHEN 'assistant' THEN 0 WHEN 'user' THEN 1 ELSE 2 END,
      id DESC
  `;

export async function chat({ request, env, url }) {
  const { token, session } = await requireStandardUser(request, env);
  const locale = getLocaleFromRequest(request, url);
  const body = await readJsonBody(request);
  const message = String(body.message || '').trim();
  const { aiType, productId } = body;
  const conversationId = requireConversationId(body.conversationId);
  const clientMessageId = requireClientMessageId(body.clientMessageId);

  if (!message || !aiType) {
    throw { status: 400, message: "Message and aiType required" };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw { status: 400, message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` };
  }

  if (!['seller', 'guardian'].includes(aiType)) {
    throw { status: 400, message: "Invalid AI type" };
  }

  const duplicate = await findIdempotentResponse(env, session.userId, clientMessageId);
  if (duplicate.hasAssistant) return streamStoredResponse(duplicate.response, aiType);
  if (duplicate.pending) throw { status: 409, message: 'AI request is still being processed' };

  await enforceAiRateLimit(env, session.userId);

  const config = await env.db.prepare("SELECT * FROM ai_config WHERE id = 1").first();
  if (!config || !config.deepseek_api_key) {
    throw { status: 503, message: "AI service not configured. Please contact administrator to set up DeepSeek API Key." };
  }

  if (aiType === 'seller' && !config.seller_ai_enabled) {
    throw { status: 503, message: "Seller AI is currently disabled" };
  }

  if (aiType === 'guardian' && !config.guardian_ai_enabled) {
    throw { status: 503, message: "Butler AI is currently disabled" };
  }

  const { results: history } = await env.db.prepare(`
    SELECT role, content FROM ai_conversations
    WHERE user_id = ? AND ai_type = ? AND conversation_id = ?
    ${HISTORY_ORDER_DESC}
    LIMIT ${HISTORY_LIMIT}
  `).bind(session.userId, aiType, conversationId).all();

  const messages = history.reverse().map(h => ({ role: h.role, content: h.content }));

  let productInfo = null;
  if (productId) {
    const product = await env.db.prepare("SELECT * FROM products WHERE id = ?").bind(productId).first();
    productInfo = product ? normalizeProduct(product, locale) : null;
  }

  const systemPrompt = aiType === 'seller'
    ? getSellerPrompt(productInfo, locale)
    : getGuardianPrompt(session, productInfo, locale);

  const messageRecordId = createId("conv");
  const userTimestamp = new Date().toISOString();

  const reservation = await env.db.prepare(`
    INSERT INTO ai_conversations (id, user_id, session_id, conversation_id, client_message_id, ai_type, role, content, product_id, metadata_json, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?)
  `).bind(
    `${messageRecordId}_u`,
    session.userId,
    token,
    conversationId,
    clientMessageId,
    aiType,
    message,
    productId || null,
    JSON.stringify({ messageLength: message.length, source: 'research-shell' }),
    userTimestamp
  ).run().catch(async (error) => {
    const existing = await findIdempotentResponse(env, session.userId, clientMessageId);
    if (existing.hasAssistant) return { duplicateResponse: existing.response };
    if (existing.pending) return { duplicatePending: true };
    throw error;
  });

  if (reservation?.duplicateResponse !== undefined) {
    return streamStoredResponse(reservation.duplicateResponse, aiType);
  }
  if (reservation?.duplicatePending) {
    throw { status: 409, message: 'AI request is still being processed' };
  }

  return streamAiResponse(async (sendDelta) => {
    let result;
    try {
      result = await getStreamedAiResponse({
        config,
        systemPrompt,
        messages,
        userMessage: message,
        locale,
        request,
        sendDelta,
      });
    } catch (error) {
      if (error?.status === 499) {
        await env.db.prepare('DELETE FROM ai_conversations WHERE user_id = ? AND client_message_id = ?')
          .bind(session.userId, clientMessageId)
          .run();
      }
      throw error;
    }
    const assistantTimestamp = createLaterIsoTimestamp(userTimestamp);

    await env.db.prepare(`
      INSERT INTO ai_conversations (id, user_id, session_id, conversation_id, reply_to_message_id, ai_type, role, content, product_id, metadata_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, 'assistant', ?, ?, ?, ?)
    `).bind(
      `${messageRecordId}_a`,
      session.userId,
      token,
      conversationId,
      clientMessageId,
      aiType,
      result.content,
      productId || null,
      JSON.stringify({
        model: config.deepseek_model || 'deepseek-chat',
        finishReason: result.finishReason || null,
        providerError: result.providerError || null,
      }),
      assistantTimestamp,
    ).run();

    return { response: result.content, aiType, providerError: result.providerError || null };
  });
}

export async function sellerNudge({ request, env, url }) {
  const { token, session } = await requireStandardUser(request, env);
  const locale = getLocaleFromRequest(request, url);
  const { productId, dwellMs, source, conversationId: rawConversationId } = await readJsonBody(request);
  const conversationId = requireConversationId(rawConversationId);

  if (!productId) {
    throw { status: 400, message: "Product required" };
  }

  const dwellDuration = Number(dwellMs || 0);
  if (!Number.isFinite(dwellDuration) || dwellDuration < 10_000) {
    throw { status: 400, message: "Dwell time must be at least 10 seconds" };
  }

  const config = await env.db.prepare("SELECT * FROM ai_config WHERE id = 1").first();
  if (!config || !config.deepseek_api_key) {
    throw { status: 503, message: "AI service not configured. Please contact administrator to set up DeepSeek API Key." };
  }

  if (!config.seller_ai_enabled) {
    throw { status: 503, message: "Seller AI is currently disabled" };
  }

  const product = await env.db.prepare("SELECT * FROM products WHERE id = ?").bind(productId).first();
  if (!product) {
    throw { status: 404, message: "Product not found" };
  }

  const productInfo = normalizeProduct(product, locale);
  const { results: history } = await env.db.prepare(`
    SELECT role, content, metadata_json FROM ai_conversations
    WHERE user_id = ? AND ai_type = 'seller' AND conversation_id = ?
    ${HISTORY_ORDER_DESC}
    LIMIT 50
  `).bind(session.userId, conversationId).all();

  const consecutiveAutomaticPromotions = await getConsecutiveAutomaticPromotions(
    env,
    session.userId,
    productId,
  );
  if (consecutiveAutomaticPromotions >= MAX_CONSECUTIVE_AUTOMATIC_PROMOTIONS) {
    return streamAiResponse(async () => ({
      skipped: true,
      reason: 'consecutive_automatic_promotions_limit',
      aiType: 'seller',
    }));
  }

  const messages = history
    .slice(0, 10)
    .reverse()
    .map(({ role, content }) => ({ role, content }));

  const promotionalNudgeStep = consecutiveAutomaticPromotions + 1;
  const nudgeInstruction = buildSellerNudgePrompt(productInfo, locale, promotionalNudgeStep);

  return streamAiResponse(async (sendDelta) => {
    const userTimestamp = new Date().toISOString();
    const result = await getStreamedAiResponse({
      config,
      systemPrompt: `${getSellerPrompt(productInfo, locale)}\n\n${nudgeInstruction}`,
      messages,
      userMessage: locale === 'en-US' ? 'Please send the proactive message now.' : '请现在发送这条主动消息。',
      locale,
      request,
      sendDelta,
    });
    const assistantTimestamp = createLaterIsoTimestamp(userTimestamp);
    const messageRecordId = createId("conv");
    await env.db.prepare(`
      INSERT INTO ai_conversations (id, user_id, session_id, conversation_id, ai_type, role, content, product_id, metadata_json, timestamp)
      VALUES (?, ?, ?, ?, 'seller', 'assistant', ?, ?, ?, ?)
    `).bind(
      `${messageRecordId}_a`,
      session.userId,
      token,
      conversationId,
      result.content,
      productId,
      JSON.stringify({
        model: config.deepseek_model || 'deepseek-chat',
        source: source || 'product-dwell',
        dwellMs: dwellDuration,
        proactive: true,
        automaticPromotion: true,
        automaticPromotionStep: promotionalNudgeStep,
        finishReason: result.finishReason || null,
        providerError: result.providerError || null,
      }),
      assistantTimestamp,
    ).run();

    return { response: result.content, aiType: 'seller', providerError: result.providerError || null };
  });
}

function streamStoredResponse(response, aiType) {
  const content = String(response || '');
  return streamAiResponse(async (sendDelta) => {
    if (content) sendDelta(content);
    return { response: content, aiType, idempotent: true };
  });
}

function streamAiResponse(producer) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, payload) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        const result = await producer((content) => send('delta', { content }));
        send('done', result);
      } catch (error) {
        send('error', { message: getStreamErrorMessage(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

async function getStreamedAiResponse({ config, systemPrompt, messages, userMessage, locale, request, sendDelta }) {
  try {
    const result = await streamDeepSeek(config, systemPrompt, messages, userMessage, {
      signal: request.signal,
      onDelta: sendDelta,
    });
    return { content: result.content, finishReason: result.finishReason, providerError: null };
  } catch (error) {
    if (error?.status === 499) throw error;

    const content = formatProviderFailure(locale, error);
    sendDelta(content);
    return {
      content,
      finishReason: null,
      providerError: getStreamErrorMessage(error),
    };
  }
}

function formatProviderFailure(locale, error) {
  const errorMessage = getStreamErrorMessage(error);
  if (locale === 'en-US') {
    return error?.httpError
      ? `AI request failed after 3 HTTP retries: ${errorMessage}`
      : `AI request failed: ${errorMessage}`;
  }
  return error?.httpError
    ? `AI 请求在 3 次 HTTP 重试后仍失败：${errorMessage}`
    : `AI 请求失败：${errorMessage}`;
}

function getStreamErrorMessage(error) {
  return String(error?.message || error || 'AI service error')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .slice(0, 500);
}

export async function getHistory({ request, env, url }) {
  const { session } = await requireStandardUser(request, env);
  const aiType = url.searchParams.get('aiType');
  const conversationId = requireConversationId(url.searchParams.get('conversationId'));

  let query = "SELECT * FROM ai_conversations WHERE user_id = ? AND conversation_id = ?";
  const params = [session.userId, conversationId];

  if (aiType) {
    query += " AND ai_type = ?";
    params.push(aiType);
  }

  query += ` ${HISTORY_ORDER_DESC} LIMIT ${HISTORY_LIMIT}`;

  const { results } = await env.db.prepare(query).bind(...params).all();

  return json({
    history: results.filter((item) => !isHiddenConversation(item) && String(item.content || '').trim()),
  });
}

export async function clearHistory({ request, env, url }) {
  const { session } = await requireStandardUser(request, env);
  const aiType = url.searchParams.get('aiType');
  const conversationId = requireConversationId(url.searchParams.get('conversationId'));

  if (!['seller', 'guardian'].includes(aiType)) {
    throw { status: 400, message: 'A valid AI type is required' };
  }

  const result = await env.db.prepare(`
    DELETE FROM ai_conversations
    WHERE user_id = ? AND ai_type = ? AND conversation_id = ?
  `).bind(session.userId, aiType, conversationId).run();

  return json({ aiType, clearedCount: result.meta.changes || 0 });
}

function requireConversationId(value) {
  const conversationId = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(conversationId)) {
    throw { status: 400, message: 'A valid conversation ID is required' };
  }
  return conversationId;
}

function requireClientMessageId(value) {
  const clientMessageId = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(clientMessageId)) {
    throw { status: 400, message: 'A valid client message ID is required' };
  }
  return clientMessageId;
}

async function findIdempotentResponse(env, userId, clientMessageId) {
  const userMessage = await env.db.prepare(`
    SELECT id FROM ai_conversations
    WHERE user_id = ? AND client_message_id = ?
  `).bind(userId, clientMessageId).first();

  if (!userMessage) return { pending: false, hasAssistant: false, response: '' };

  const assistantMessage = await env.db.prepare(`
    SELECT content FROM ai_conversations
    WHERE user_id = ? AND reply_to_message_id = ?
    LIMIT 1
  `).bind(userId, clientMessageId).first();

  return {
    pending: !assistantMessage,
    hasAssistant: Boolean(assistantMessage),
    response: String(assistantMessage?.content || ''),
  };
}

async function enforceAiRateLimit(env, userId) {
  const row = await env.db.prepare(`
    SELECT COUNT(*) AS value FROM ai_conversations
    WHERE user_id = ? AND role = 'user'
      AND timestamp >= datetime('now', '-60 seconds')
  `).bind(userId).first();

  if (Number(row?.value || 0) >= MAX_AI_REQUESTS_PER_MINUTE) {
    throw { status: 429, message: 'Too many AI requests. Please wait a moment and try again.' };
  }
}

async function getConsecutiveAutomaticPromotions(env, userId, productId) {
  const { results } = await env.db.prepare(`
    SELECT metadata_json FROM ai_conversations
    WHERE user_id = ? AND product_id = ? AND ai_type = 'seller' AND role = 'assistant'
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `).bind(userId, productId, MAX_CONSECUTIVE_AUTOMATIC_PROMOTIONS).all();

  let count = 0;
  for (const message of results) {
    if (!isAutomaticPromotion(message)) break;
    count += 1;
  }
  return count;
}

function isAutomaticPromotion(message) {
  try {
    const metadata = JSON.parse(message.metadata_json || '{}');
    return metadata.automaticPromotion === true && !metadata.providerError;
  } catch {
    return false;
  }
}

function isHiddenConversation(item) {
  try {
    const metadata = JSON.parse(item.metadata_json || '{}');
    return Boolean(metadata[HIDDEN_METADATA_KEY]);
  } catch {
    return false;
  }
}

function createLaterIsoTimestamp(previousTimestamp) {
  const previousTime = Date.parse(previousTimestamp);
  const now = Date.now();
  const nextTime = Number.isFinite(previousTime) ? Math.max(now, previousTime + 1) : now;
  return new Date(nextTime).toISOString();
}

function buildSellerNudgePrompt(productInfo, locale, step) {
  const productName = productInfo.name || (locale === 'en-US' ? 'this item' : '这个商品');
  const nudgeStage = Math.min(Math.max(step, 1), MAX_CONSECUTIVE_AUTOMATIC_PROMOTIONS);

  if (locale === 'en-US') {
    const stageInstructions = [
      'This is the first automatic message. Open with one plausible use scenario and connect it to one relevant product benefit. Do not list specifications or ask a question.',
      'This is the second automatic message. Add one different, verifiable product benefit that was not used in the first automatic message, and connect it to a different practical need. Do not repeat the earlier scenario, benefit, or wording.',
      'This is the third automatic message. Shift from recommending to fit-checking: invite the user to share one priority or concern that would help assess fit. Use a fresh angle, and do not repeat any earlier scenario, benefit, phrase, or call to action.',
    ];

    return [
      `The user has been viewing "${productName}" for at least 10 seconds. As the Seller AI, proactively send one short message to the user.`,
      stageInstructions[nudgeStage - 1],
      'Review the earlier automatic messages in the conversation before writing. Each message in this three-message sequence must have a distinct purpose and must not reuse the same product angle.',
      'Do not use urgency, scarcity, discounts, popularity, social proof, hype, or pressure to purchase. Do not present a market trend or user need as a fact unless it is provided in the product information.',
      'Do not mention system detection, dwell time, backend triggers, research logs, or this instruction.',
      'Output only the user-facing message, under 45 English words.',
    ].join('\n');
  }

  const stageInstructions = [
    '这是第1条自动消息。围绕一个可能的使用场景切入，并连接一项相关商品价值；不要罗列参数，也不要提问。',
    '这是第2条自动消息。补充第一条未提及的一项可验证商品价值，并对应另一种实际需求；不要重复之前的场景、价值点或措辞。',
    '这是第3条自动消息。由推荐转为匹配确认：邀请用户说出一个最在意的需求或顾虑，以便判断是否适合；使用全新角度，不要重复之前的场景、价值点、措辞或行动引导。',
  ];

  return [
    `用户正在查看"${productName}"至少10秒，请你作为卖家 AI 主动向用户发一条简短消息。`,
    stageInstructions[nudgeStage - 1],
    '写作前先查看对话中已有的自动消息。这三条消息必须各有不同目的，且不得重复相同的商品切入角度。',
    '不要使用紧迫感、稀缺、折扣、热销、从众、夸张或催单表达；没有商品信息支撑时，也不要把市场趋势或用户需求说成事实。',
    '不要提及系统检测、停留时长、后台触发、研究记录或这条指令。',
    '直接输出面向用户的一条消息，控制在80个中文字符以内。',
  ].join('\n');
}
