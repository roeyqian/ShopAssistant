const METRIC_IDS = [
  'need_clarity',
  'evidence_grounding',
  'budget_alignment',
  'pressure_awareness',
  'action_plan',
];

const DECISIONS = new Set(['buy', 'observe', 'not_buy']);

export function getResearchReportPrompt({ productInfo, profile, finalDecision, sellerTranscript, guardianTranscript, locale = 'zh-CN' }) {
  const context = JSON.stringify({
    product: productInfo ? {
      name: productInfo.name,
      price: productInfo.price,
      original_price: productInfo.original_price,
      rating: productInfo.rating,
      specs: productInfo.specs,
      description: productInfo.description,
    } : null,
    participant_profile: profile || {},
    final_decision: finalDecision,
  });
  const english = locale === 'en-US';
  const instructions = english ? [
    'You create a concise post-study decision-process report from the two supplied transcripts only.',
    'This is an interpretive research visualization, not a clinical assessment, personality measure, diagnosis, or a recommendation to buy or not buy.',
    'Use these theory lenses explicitly and conservatively: self-determination theory (Ryan & Deci, American Psychologist, 2000) for autonomous need alignment; implementation intentions (Gollwitzer, American Psychologist, 1999) for concrete next-step planning; persuasion knowledge (Friestad & Wright, Journal of Consumer Research, 1994) for recognizing selling influence; and mental accounting (Thaler, Marketing Science, 1985) for budget/opportunity-cost framing.',
    'Score only expressed, observable decision signals in the transcripts. A score is a 0–100 visualization index, not a validated psychometric score. Never infer mental states, traits, demographics, or hidden reasoning. Missing information must lower confidence rather than be filled in.',
    'Return ONLY valid JSON using exactly this shape:',
    '{"summary":"2 concise sentences","metrics":[{"id":"need_clarity|evidence_grounding|budget_alignment|pressure_awareness|action_plan","score":0,"observation":"brief transcript-grounded observation"}],"highlights":[{"title":"short heading","detail":"one transcript-grounded observation"}],"evidence":{"supported":0,"uncertain":0,"needs_verification":0},"confidence":0,"theory_notes":[{"id":"autonomy|planning|persuasion|budget","observation":"brief link to a transcript signal"}]}',
    'Include exactly five metrics, one for each metric ID. Scores must be integers. evidence values are non-negative counts of claims/signals you identified, not percentages. Include 2–4 highlights and all four theory notes. Keep every observation and detail under 180 characters. Do not quote large transcript passages or invent product facts.',
  ] : [
    '你要仅根据提供的两段对话，生成一份简洁的研究完成后“决策过程报告”。',
    '这是一份解释性的研究可视化，不是临床评估、人格测量、诊断，也不是让用户买或不买的建议。',
    '请谨慎且明确地使用以下理论视角：自我决定理论（Ryan & Deci，American Psychologist，2000）用于自主需求一致性；执行意图（Gollwitzer，American Psychologist，1999）用于具体下一步计划；劝服知识（Friestad & Wright，Journal of Consumer Research，1994）用于识别销售影响；心理账户（Thaler，Marketing Science，1985）用于预算与机会成本框架。',
    '只对对话中明确表达、可观察到的决策信号评分。分数是 0–100 的可视化指数，不是经过验证的心理测量分数。不要推断心理状态、人格、人口学特征或隐藏推理。信息缺失时应降低置信度，不得补全。',
    '只能返回一个有效 JSON，严格使用以下结构：',
    '{"summary":"2 句简洁总结","metrics":[{"id":"need_clarity|evidence_grounding|budget_alignment|pressure_awareness|action_plan","score":0,"observation":"基于对话的简短观察"}],"highlights":[{"title":"短标题","detail":"一条基于对话的观察"}],"evidence":{"supported":0,"uncertain":0,"needs_verification":0},"confidence":0,"theory_notes":[{"id":"autonomy|planning|persuasion|budget","observation":"与对话信号相关的简短说明"}]}',
    '必须恰好给出五项 metrics，每个 ID 各一项。score 必须是整数。evidence 是你识别到的支持、未确定、待核验信号数量，不是百分比。给出 2–4 个 highlights 以及全部 4 条 theory_notes。每条观察和说明不超过 180 个字符。不要大段引用对话，也不要编造商品事实。',
  ];

  return [
    ...instructions,
    '',
    english ? 'Study context:' : '研究背景：', context,
    '',
    english ? 'Seller AI transcript:' : '卖家 AI 对话：', String(sellerTranscript || '').slice(0, 9000),
    '',
    english ? 'Butler AI transcript:' : '管家 AI 对话：', String(guardianTranscript || '').slice(0, 9000),
  ].join('\n');
}

export function parseResearchReport(raw, locale = 'zh-CN') {
  let parsed = null;
  try {
    parsed = JSON.parse(stripJsonFence(String(raw || '').trim()));
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallbackReport(locale);

  const metricMap = new Map((Array.isArray(parsed.metrics) ? parsed.metrics : [])
    .filter((item) => METRIC_IDS.includes(item?.id))
    .map((item) => [item.id, item]));
  const metrics = METRIC_IDS.map((id) => {
    const item = metricMap.get(id);
    return {
      id,
      score: clampInteger(item?.score),
      observation: cleanText(item?.observation, fallbackMetricObservation(id, locale), 180),
    };
  });
  const theoryIds = ['autonomy', 'planning', 'persuasion', 'budget'];
  const theoryMap = new Map((Array.isArray(parsed.theory_notes) ? parsed.theory_notes : [])
    .filter((item) => theoryIds.includes(item?.id))
    .map((item) => [item.id, item]));

  return {
    summary: cleanText(parsed.summary, fallbackSummary(locale), 420),
    metrics,
    highlights: (Array.isArray(parsed.highlights) ? parsed.highlights : []).slice(0, 4).map((item) => ({
      title: cleanText(item?.title, locale === 'en-US' ? 'Transcript signal' : '对话信号', 80),
      detail: cleanText(item?.detail, '', 180),
    })).filter((item) => item.detail).slice(0, 4),
    evidence: {
      supported: clampCount(parsed.evidence?.supported),
      uncertain: clampCount(parsed.evidence?.uncertain),
      needs_verification: clampCount(parsed.evidence?.needs_verification),
    },
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    theory_notes: theoryIds.map((id) => ({
      id,
      observation: cleanText(theoryMap.get(id)?.observation, fallbackTheoryNote(id, locale), 180),
    })),
  };
}

export function createResearchReportFallback(locale = 'zh-CN') {
  return fallbackReport(locale);
}

function fallbackReport(locale) {
  return {
    summary: fallbackSummary(locale),
    metrics: METRIC_IDS.map((id) => ({ id, score: 0, observation: fallbackMetricObservation(id, locale) })),
    highlights: [],
    evidence: { supported: 0, uncertain: 0, needs_verification: 0 },
    confidence: 0,
    theory_notes: ['autonomy', 'planning', 'persuasion', 'budget'].map((id) => ({ id, observation: fallbackTheoryNote(id, locale) })),
  };
}

function stripJsonFence(value) {
  const fence = String.fromCharCode(96).repeat(3);
  let text = value;
  if (text.startsWith(fence)) text = text.slice(fence.length).replace(/^json\s*/i, '');
  if (text.endsWith(fence)) text = text.slice(0, -fence.length);
  return text.trim();
}

function cleanText(value, fallback, limit) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.slice(0, limit) || fallback;
}

function clampInteger(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

function clampCount(value) {
  return Math.min(99, Math.max(0, Math.round(Number(value) || 0)));
}

function fallbackSummary(locale) {
  return locale === 'en-US'
    ? 'The report could not identify enough structured signals from the saved conversations. It therefore presents missing information rather than inferring a psychological profile.'
    : '已保存的对话中没有足够的结构化信号可供分析，因此报告呈现信息缺口，而不推断任何心理画像。';
}

function fallbackMetricObservation(id, locale) {
  const zh = {
    need_clarity: '未获得足够对话信号。', evidence_grounding: '未获得足够可核验信号。', budget_alignment: '未获得足够预算相关信号。', pressure_awareness: '未获得足够促销影响相关信号。', action_plan: '未获得足够下一步计划信号。',
  };
  const en = {
    need_clarity: 'Not enough conversation signal was available.', evidence_grounding: 'Not enough verifiable signal was available.', budget_alignment: 'Not enough budget-related signal was available.', pressure_awareness: 'Not enough promotion-related signal was available.', action_plan: 'Not enough next-step planning signal was available.',
  };
  return (locale === 'en-US' ? en : zh)[id];
}

function fallbackTheoryNote(id, locale) {
  const zh = { autonomy: '未对自主性作推断。', planning: '未识别到足够的行动计划信号。', persuasion: '未识别到足够的说服影响识别信号。', budget: '未识别到足够的预算权衡信号。' };
  const en = { autonomy: 'No autonomy inference is made.', planning: 'Not enough action-planning signal was identified.', persuasion: 'Not enough persuasion-recognition signal was identified.', budget: 'Not enough budget-trade-off signal was identified.' };
  return (locale === 'en-US' ? en : zh)[id];
}
