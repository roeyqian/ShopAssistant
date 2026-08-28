const INCLINATIONS = new Set(['buy', 'observe', 'not_buy']);
const EVIDENCE_STATUS = new Set(['confirmed', 'unverified', 'missing']);

export function getStructuredAgentPrompt(locale = 'zh-CN') {
  if (locale === 'en-US') {
    return [
      'Keep your role and independent viewpoint. Reply as a natural conversation, but return ONLY one valid JSON object with this shape:',
      '{"reply":"your user-facing answer","analysis":{"inclination":"buy"|"observe"|"not_buy","confidence":number,"summary":"short analysis of the user\'s current stated inclination","evidence":[{"item":"user statement or fact","value":"what supports the reading","status":"confirmed"|"unverified"|"missing"}],"next_questions":["questions"]},"recommended_product_ids":["product IDs from the catalog"]}',
      'The analysis is NOT a recommendation to the user. It must classify the user\'s current language as leaning toward buying, continuing to observe, or not buying. Do not let your own role preference replace what the user actually expressed.',
      'Use "buy" when the user currently expresses an intention or clear preference to buy; use "not_buy" when they express an intention or clear preference not to buy; otherwise use "observe", including when they are uncertain, weighing options, or asking for more information.',
      'Always include an analysis based on the current conversation. Cite the user\'s wording in evidence when possible, and mark assumptions or missing facts accordingly.',
      'When you explicitly recommend, compare, or name products, include their exact catalog IDs in recommended_product_ids. Use an empty array when no product is being recommended.',
      'Never invent product facts, reviews, policies, comparisons, discounts, or technical specifications.',
      'The reply field should remain helpful and readable. Do not include Markdown fences or any text outside the JSON.',
    ].join('\n');
  }

  return [
    '保留你当前的角色和独立视角。请像正常对话一样回答，但只能返回一个有效 JSON 对象，严格使用以下结构：',
    '{"reply":"面向用户的自然回答","analysis":{"inclination":"buy"|"observe"|"not_buy","confidence":number,"summary":"对用户当前购买倾向的简短分析","evidence":[{"item":"用户表述或事实","value":"支持判断的内容","status":"confirmed"|"unverified"|"missing"}],"next_questions":["问题"]},"recommended_product_ids":["商品目录中的商品 ID"]}',
    'analysis 是对用户当前言语的结构化分析，不是向用户下达购买建议。必须判断用户当前表述更倾向于“买”“继续观望”还是“不买”；不要用你自己的角色偏好代替用户实际表达的倾向。',
    '用户明确表达想买、准备买或偏向买时使用 "buy"；明确表达不想买、决定不买或偏向不买时使用 "not_buy"；不确定、权衡中、询问更多信息或没有表达明确取向时使用 "observe"。',
    '每次都要根据当前对话输出 analysis；尽量在 evidence 中引用或概括用户的表述，并把推测或缺失事实标明状态。',
    '当你明确推荐、比较或点名商品时，把对应的准确商品 ID 写入 recommended_product_ids；没有推荐商品时使用空数组。',
    '绝不编造商品事实、评价、政策、竞品、折扣或技术参数。',
    'reply 字段要保持自然、可读。不要使用 Markdown 代码围栏，也不要在 JSON 外输出文字。',
  ].join('\n');
}

export function parseStructuredAgentResponse(raw, locale = 'zh-CN') {
  const text = String(raw || '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    // Some providers occasionally leave a natural-language quote unescaped in
    // `reply`. Recover the user-facing reply and any independently valid
    // analysis instead of displaying the protocol JSON in the conversation.
    parsed = recoverStructuredResponse(text);
  }

  const reply = String(parsed?.reply || parsed?.message || fallbackReply(text, locale)).trim();
  return {
    reply,
    assessment: normalizeAssessment(parsed, locale),
    valid: isValidStructuredResponse(parsed),
  };
}

function isValidStructuredResponse(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value.reply || value.message) === 'string'
    && value.analysis
    && typeof value.analysis === 'object'
    && !Array.isArray(value.analysis)
    && Array.isArray(value.recommended_product_ids || value.product_ids || value.recommendedProductIds),
  );
}

export function parseStoredAssessment(metadataJson, locale = 'zh-CN') {
  try {
    const metadata = JSON.parse(metadataJson || '{}');
    return metadata?.assessment && typeof metadata.assessment === 'object'
      ? normalizeAssessment(metadata.assessment, locale)
      : null;
  } catch {
    return null;
  }
}

function normalizeAssessment(value, locale) {
  const analysis = value?.analysis && typeof value.analysis === 'object' ? value.analysis : value;
  const inclination = normalizeInclination(analysis?.inclination || analysis?.recommendation);
  const evidence = Array.isArray(analysis?.evidence)
    ? analysis.evidence.slice(0, 8).map((item) => ({
        item: String(item?.item || (locale === 'en-US' ? 'User statement' : '用户表述')).trim(),
        value: String(item?.value || '').trim(),
        status: EVIDENCE_STATUS.has(item?.status) ? item.status : 'unverified',
      }))
    : [];

  return {
    analysis: {
      inclination,
      confidence: normalizeConfidence(analysis?.confidence),
      summary: String(analysis?.summary || fallbackSummary(inclination, locale)).trim(),
      evidence,
      next_questions: Array.isArray(analysis?.next_questions)
        ? analysis.next_questions.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
    },
    recommended_product_ids: normalizeProductIds(
      value?.recommended_product_ids || value?.product_ids || value?.recommendedProductIds,
    ),
  };
}

function normalizeInclination(value) {
  if (INCLINATIONS.has(value)) return value;
  if (value === 'buy_now') return 'buy';
  if (value === 'do_not_buy') return 'not_buy';
  return 'observe';
}

function normalizeProductIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

function stripJsonFence(text) {
  const fence = String.fromCharCode(96).repeat(3);
  let value = text;
  if (value.startsWith(fence)) value = value.slice(fence.length).replace(/^json\s*/i, '');
  if (value.endsWith(fence)) value = value.slice(0, -fence.length);
  return value.trim();
}

function recoverStructuredResponse(text) {
  const reply = extractJsonStringField(text, ['reply', 'message']);
  const analysis = extractJsonObjectField(text, 'analysis');
  const recommendedProductIds = extractJsonArrayField(text, 'recommended_product_ids');
  return {
    ...(reply ? { reply } : {}),
    ...(analysis ? { analysis } : {}),
    ...(recommendedProductIds ? { recommended_product_ids: recommendedProductIds } : {}),
  };
}

function extractJsonStringField(text, keys) {
  for (const key of keys) {
    const startMatch = new RegExp(`"${key}"\\s*:\\s*"`).exec(text);
    if (!startMatch) continue;
    const start = startMatch.index + startMatch[0].length;
    const nextField = /"\s*,\s*"(?:analysis|recommended_product_ids|product_ids|recommendedProductIds)"\s*:/g;
    nextField.lastIndex = start;
    const boundary = nextField.exec(text);
    const value = text.slice(start, boundary ? boundary.index : findClosingQuote(text, start));
    if (value) return decodePossiblyMalformedJsonString(value);
  }
  return '';
}

function findClosingQuote(text, start) {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] !== '"' || text[index - 1] === '\\') continue;
    return index;
  }
  return text.length;
}

function decodePossiblyMalformedJsonString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    // Keep an unescaped quote as text while decoding common JSON escapes.
    return value
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/\\(["\\/bfnrt])/g, (_, character) => ({
        b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
      })[character] ?? character);
  }
}

function extractJsonObjectField(text, key) {
  const match = new RegExp(`"${key}"\\s*:\\s*\\{`).exec(text);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  const end = findJsonContainerEnd(text, start, '{', '}');
  if (end < 0) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractJsonArrayField(text, key) {
  const match = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  const end = findJsonContainerEnd(text, start, '[', ']');
  if (end < 0) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function findJsonContainerEnd(text, start, open, close) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === open) depth += 1;
    else if (character === close && --depth === 0) return index;
  }
  return -1;
}

function fallbackReply(text, locale) {
  if (!text.includes('"reply"') && !text.includes('"message"')) return text;
  return locale === 'en-US'
    ? 'The AI response could not be read. Please try again.'
    : 'AI 回复无法读取，请重试。';
}

function normalizeConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function fallbackSummary(inclination, locale) {
  if (locale === 'en-US') {
    return inclination === 'buy'
      ? 'The user currently leans toward buying.'
      : inclination === 'not_buy'
        ? 'The user currently leans toward not buying.'
        : 'The user is still observing or weighing the decision.';
  }
  return inclination === 'buy'
    ? '用户当前表述倾向于购买。'
    : inclination === 'not_buy'
      ? '用户当前表述倾向于不购买。'
      : '用户当前仍在观望或权衡。';
}
