const RECOMMENDATIONS = new Set(['buy_now', 'verify', 'do_not_buy']);
const EVIDENCE_STATUS = new Set(['confirmed', 'unverified', 'missing']);

export function getDecisionPrompt(productInfo, locale = 'zh-CN') {
  const productContext = productInfo
    ? JSON.stringify({
        name: productInfo.name,
        subtitle: productInfo.subtitle,
        description: productInfo.description,
        price: productInfo.price,
        original_price: productInfo.original_price,
        stock: productInfo.stock,
        rating: productInfo.rating,
        sales_count: productInfo.sales_count,
        specs: productInfo.specs,
        tags: productInfo.tags,
      })
    : '{}';

  if (locale === 'en-US') {
    return [
      'You are a unified purchase decision panel. Assess every user message from two explicit perspectives:',
      '1. Product-value perspective: map the user stated use case and needs to verifiable product capabilities. Do not invent benefits.',
      '2. Consumer-protection perspective: check need, budget, pressure, fit, price, after-sales support, and missing evidence. Do not shame or command the user.',
      '',
      'Combine both perspectives into a transparent, actionable decision brief. The user owns the final decision. Treat product fields as product evidence, user statements as user evidence, and all other claims as unverified. Never invent reviews, policies, comparisons, discounts, or technical specifications.',
      '',
      'Return ONLY one valid JSON object, with no Markdown fences or text outside JSON, using exactly this shape:',
      '{',
      '  "ready": boolean,',
      '  "recommendation": "buy_now" | "verify" | "do_not_buy",',
      '  "confidence": number between 0 and 1,',
      '  "summary": "one concise user-facing conclusion",',
      '  "seller_view": {"summary": "...", "points": ["..."]},',
      '  "guardian_view": {"summary": "...", "points": ["..."]},',
      '  "consensus": ["shared findings"],',
      '  "disagreements": ["remaining differences or trade-offs"],',
      '  "evidence": [{"item": "fact or question", "value": "what is known or unknown", "source": "product_info | user_stated | user_claim | missing", "status": "confirmed | unverified | missing"}],',
       '  "next_questions": ["questions that would materially change the recommendation"]',
      '}',
      '',
      'Use "buy_now" only when need and fit are clear, major facts are supported, and no material unresolved risk remains.',
      'Use "do_not_buy" when the user explicitly does not need it, a hard constraint is violated, or evidence shows a material mismatch.',
      'Otherwise use "verify". If a material question remains unanswered, set ready to false and put it in next_questions. Set ready to true only when evidence is sufficient.',
      'Always include at least one evidence item. Keep evidence separate from opinion. The recommendation must be exactly one of the three enum values.',
      '',
      'Current product evidence (may be empty):',
      productContext,
      '',
      'Reply only in English.',
    ].join('\n');
  }

  return [
    '你是一个统一的购买决策评审小组。每条用户输入都必须从两个明确视角同时分析：',
    '1. 商品价值视角：把用户明确说出的使用场景和需求，连接到商品中可验证的能力；不能编造卖点。',
    '2. 消费保护视角：检查需求、预算、刺激话术、适配性、价格、售后和证据缺口；不羞辱用户，也不替用户强行下命令。',
    '',
    '请把两个视角合并成透明、可执行的决策简报，最终决定权属于用户。商品字段是商品证据，用户明确说过的内容是用户证据，其余说法都视为未核实。绝不编造评价、政策、竞品、折扣或技术参数。',
    '',
    '只能返回一个有效 JSON 对象，不要使用 Markdown 代码围栏，也不要在 JSON 外输出任何文字。严格使用以下结构：',
    '{',
    '  "ready": boolean,',
    '  "recommendation": "buy_now" | "verify" | "do_not_buy",',
    '  "confidence": 0 到 1 之间的数字,',
    '  "summary": "一句简洁的面向用户的结论",',
    '  "seller_view": {"summary": "...", "points": ["..."]},',
    '  "guardian_view": {"summary": "...", "points": ["..."]},',
    '  "consensus": ["双方共同认可的发现"],',
    '  "disagreements": ["仍存在的差异或取舍"],',
    '  "evidence": [{"item": "事实或问题", "value": "已知或未知内容", "source": "product_info | user_stated | user_claim | missing", "status": "confirmed | unverified | missing"}],',
    '  "next_questions": ["会实质改变建议的问题"]',
    '}',
      '',
    '只有当用户需求和适配性清楚、主要购买事实有足够证据、且没有重要未解决风险时，才能使用 recommendation="buy_now"。',
    '当用户明确表示不需要、某个明确硬性约束不满足，或已有证据显示商品与需求明显不匹配时，使用 "do_not_buy"。',
    '其他情况使用 "verify"。只要有重要问题没有回答，就将 ready 设为 false、recommendation 保持 "verify"，并把问题放进 next_questions。证据足够时才将 ready 设为 true。',
    '至少提供一条 evidence，事实和观点要分开；用户自己提出的说法如果没有商品字段支持，标记为 unverified。',
    'recommendation 必须严格是三个枚举值之一，不得使用第四种状态。',
    '',
    '当前商品证据（可能为空）：',
    productContext,
    '',
    '只使用中文回复。',
  ].join('\n');
}

export function getSynthesisPrompt(productInfo, sellerTranscript, guardianTranscript, locale = 'zh-CN') {
  const sellerLabel = locale === 'en-US' ? 'Independent Seller AI transcript' : '独立卖家 AI 对话记录';
  const guardianLabel = locale === 'en-US' ? 'Independent Butler AI transcript' : '独立管家 AI 对话记录';
  const instruction = locale === 'en-US'
    ? 'Synthesize these two independent conversations. Do not answer as either agent, do not invent missing facts, and do not treat one agent\'s speculation as evidence. The current user input is not being sent to either agent by this synthesis request.'
    : '请综合这两段独立对话。不要冒充其中任何一个 AI，不要编造缺失事实，也不要把某个 AI 的推测当成证据。本次综合请求不会把新的用户输入发送给任一 AI。';
  return `${getDecisionPrompt(productInfo, locale)}\n\n${instruction}\n\n${sellerLabel}:\n${String(sellerTranscript || '')}\n\n${guardianLabel}:\n${String(guardianTranscript || '')}`;
}

export function parseDecisionResponse(raw, locale = 'zh-CN') {
  const text = String(raw || '').trim();
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return createFallbackDecision(locale, true);
  }

  const recommendation = RECOMMENDATIONS.has(parsed.recommendation)
    ? parsed.recommendation
    : 'verify';
  const evidence = normalizeEvidence(parsed.evidence);

  return {
    ready: Boolean(parsed.ready) && evidence.length > 0,
    recommendation,
    confidence: normalizeConfidence(parsed.confidence),
    summary: normalizeText(parsed.summary, recommendationSummary(recommendation, locale)),
    seller_view: normalizePerspective(parsed.seller_view),
    guardian_view: normalizePerspective(parsed.guardian_view),
    consensus: normalizeArray(parsed.consensus),
    disagreements: normalizeArray(parsed.disagreements),
    evidence: evidence.length
      ? evidence
      : [{
          item: locale === 'en-US' ? 'Decision evidence' : '决策证据',
          value: locale === 'en-US' ? 'No supporting evidence was returned.' : '模型没有返回可支持判断的证据。',
          source: 'missing',
          status: 'missing',
        }],
    next_questions: normalizeArray(parsed.next_questions),
  };
}

export function parseStoredAssessment(metadataJson) {
  try {
    const metadata = JSON.parse(metadataJson || '{}');
    return metadata?.assessment && typeof metadata.assessment === 'object' ? metadata.assessment : null;
  } catch {
    return null;
  }
}

function stripJsonFence(text) {
  const fence = String.fromCharCode(96).repeat(3);
  let value = text;
  if (value.startsWith(fence)) {
    value = value.slice(fence.length).replace(/^json\s*/i, '');
  }
  if (value.endsWith(fence)) value = value.slice(0, -fence.length);
  return value.trim();
}

function normalizePerspective(value) {
  return {
    summary: normalizeText(value?.summary, ''),
    points: normalizeArray(value?.points).slice(0, 4),
  };
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => ({
    item: normalizeText(item?.item, 'Evidence'),
    value: normalizeText(item?.value, ''),
    source: ['product_info', 'user_stated', 'user_claim', 'missing'].includes(item?.source) ? item.source : 'missing',
    status: EVIDENCE_STATUS.has(item?.status) ? item.status : 'unverified',
  }));
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8);
}

function normalizeText(value, fallback) {
  const text = String(value || '').trim();
  return text.slice(0, 800) || fallback;
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function recommendationSummary(recommendation, locale) {
  if (locale === 'en-US') {
    return recommendation === 'buy_now'
      ? 'The available information supports buying now.'
      : recommendation === 'do_not_buy'
        ? 'The available information does not support buying this item.'
        : 'More information should be verified before deciding.';
  }
  return recommendation === 'buy_now'
    ? '现有信息支持立即购买。'
    : recommendation === 'do_not_buy'
      ? '现有信息不支持购买这件商品。'
      : '在做决定前，还需要进一步核实信息。';
}

function createFallbackDecision(locale, parseError = false) {
  const english = locale === 'en-US';
  return {
    ready: false,
    recommendation: 'verify',
    confidence: 0,
    summary: english ? 'More information should be verified before deciding.' : '在做决定前，还需要进一步核实信息。',
    seller_view: {
      summary: english ? 'There is not enough structured information yet.' : '目前还没有足够的结构化信息。',
      points: [],
    },
    guardian_view: {
      summary: english ? 'Please verify the key facts before deciding.' : '请先核实关键事实，再做决定。',
      points: [],
    },
    consensus: [],
    disagreements: [],
    evidence: [{
      item: english ? 'Structured analysis' : '结构化分析',
      value: english ? 'The response could not be safely converted into a complete evidence brief.' : '这次回复无法安全转换为完整的证据简报。',
      source: 'missing',
      status: 'missing',
    }],
    next_questions: [english ? 'What is your intended use and biggest concern?' : '你的具体使用场景和最大顾虑是什么？'],
    parseError,
  };
}
