const RECOMMENDATIONS = new Set(['buy_now', 'verify', 'do_not_buy']);
const EVIDENCE_STATUS = new Set(['confirmed', 'unverified', 'missing']);

export function getStructuredAgentPrompt(locale = 'zh-CN') {
  if (locale === 'en-US') {
    return [
      'Keep your role and independent viewpoint. Reply as a natural conversation, but return ONLY one valid JSON object with this shape:',
      '{"reply":"your user-facing answer","assessment":{"ready":boolean,"recommendation":"buy_now"|"verify"|"do_not_buy"|null,"confidence":number,"summary":"short conclusion","evidence":[{"item":"fact or question","value":"known or unknown","status":"confirmed"|"unverified"|"missing"}],"next_questions":["at most three questions"],"recommended_product_ids":["product IDs from the catalog"]}}',
      'Use ready=true and one of the three recommendations only when the conversation contains enough information to make a responsible recommendation.',
      'Until then use ready=false and recommendation="verify"; ask only the questions that would materially change the decision.',
      'When you explicitly recommend, compare, or name products, include their exact catalog IDs in recommended_product_ids (at most six). Use an empty array when no product is being recommended.',
      'Never invent product facts, reviews, policies, comparisons, discounts, or technical specifications.',
      'The reply field should remain helpful and readable. Do not include Markdown fences or any text outside the JSON.',
    ].join('\n');
  }

  return [
    '保留你当前的角色和独立视角。请像正常对话一样回答，但只能返回一个有效 JSON 对象，严格使用以下结构：',
    '{"reply":"面向用户的自然回答","assessment":{"ready":boolean,"recommendation":"buy_now"|"verify"|"do_not_buy"|null,"confidence":number,"summary":"简短结论","evidence":[{"item":"事实或问题","value":"已知或未知内容","status":"confirmed"|"unverified"|"missing"}],"next_questions":["最多三个问题"],"recommended_product_ids":["商品目录中的商品 ID"]}}',
    '只有当对话信息足够、可以负责任地给出建议时，才将 ready=true，并使用三个建议之一。',
    '信息不足时使用 ready=false、recommendation="verify"，只追问会实质改变判断的问题。',
    '当你明确推荐、比较或点名商品时，把对应的准确商品 ID 写入 recommended_product_ids（最多六个）；没有推荐商品时使用空数组。',
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
    // Preserve a provider response even if it did not follow the JSON contract.
  }

  const reply = String(parsed?.reply || parsed?.message || text || '').trim();
  const assessment = normalizeAssessment(parsed?.assessment, locale);
  return { reply, assessment };
}

export function parseStoredAssessment(metadataJson) {
  try {
    const metadata = JSON.parse(metadataJson || '{}');
    return metadata?.assessment && typeof metadata.assessment === 'object' ? metadata.assessment : null;
  } catch {
    return null;
  }
}

function normalizeAssessment(value, locale) {
  const recommendation = RECOMMENDATIONS.has(value?.recommendation) ? value.recommendation : 'verify';
  const evidence = Array.isArray(value?.evidence)
    ? value.evidence.slice(0, 8).map((item) => ({
        item: String(item?.item || (locale === 'en-US' ? 'Decision evidence' : '决策证据')).trim(),
        value: String(item?.value || '').trim(),
        status: EVIDENCE_STATUS.has(item?.status) ? item.status : 'unverified',
      }))
    : [];

  return {
    ready: Boolean(value?.ready) && evidence.length > 0,
    recommendation,
    confidence: normalizeConfidence(value?.confidence),
    summary: String(value?.summary || fallbackSummary(recommendation, locale)).trim(),
    evidence,
    next_questions: Array.isArray(value?.next_questions)
      ? value.next_questions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : [],
    recommended_product_ids: normalizeProductIds(
      value?.recommended_product_ids || value?.product_ids || value?.recommendedProductIds,
    ),
  };
}

function normalizeProductIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 6);
}

function stripJsonFence(text) {
  const fence = String.fromCharCode(96).repeat(3);
  let value = text;
  if (value.startsWith(fence)) value = value.slice(fence.length).replace(/^json\s*/i, '');
  if (value.endsWith(fence)) value = value.slice(0, -fence.length);
  return value.trim();
}

function normalizeConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function fallbackSummary(recommendation, locale) {
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
