import { json, readJsonBody, requireAdmin, requireAuth, requireStandardUser, getSession } from "../../app/http.js";
import { getLocaleFromRequest } from "../shop/utils.js";
import { normalizeProduct } from "../shop/utils.js";

export async function clearUserResearchData({ request, env, url }) {
  const { session } = await requireStandardUser(request, env);
  const researchRunId = requireResearchRunId(url.searchParams.get('runId'));
  const conversationIds = researchConversationIds(researchRunId);

  const archived = await env.db.prepare(`
    SELECT id FROM completed_research_archives
    WHERE user_id = ? AND research_run_id = ?
  `).bind(session.userId, researchRunId).first();

  if (archived) {
    throw { status: 409, message: 'Completed research cannot be cleared' };
  }

  // A run ID isolates a participant's active study from previous and archived
  // studies. Leaving an unfinished run must never delete another run's data.
  const results = await env.db.batch([
    env.db.prepare(`
      DELETE FROM ai_conversations
      WHERE user_id = ? AND conversation_id IN (?, ?)
    `).bind(session.userId, ...conversationIds),
    env.db.prepare(`
      DELETE FROM user_behaviors
      WHERE user_id = ?
        AND json_extract(metadata_json, '$.researchRunId') = ?
    `).bind(session.userId, researchRunId),
  ]);

  return json({
    message: "Research data cleared",
    conversationsCleared: Number(results[0]?.meta?.changes || 0),
    behaviorsCleared: Number(results[1]?.meta?.changes || 0),
  });
}

export async function archiveCompletedResearch({ request, env }) {
  const { session } = await requireStandardUser(request, env);
  const body = await readJsonBody(request);
  const researchRunId = requireResearchRunId(body?.researchRunId);
  const conversationIds = researchConversationIds(researchRunId);
  const finalDecision = String(body?.record?.finalDecision || '').trim();
  if (!['buy', 'observe', 'not_buy'].includes(finalDecision)) {
    throw { status: 400, message: 'A final research decision is required' };
  }

  const clientRecord = body?.record && typeof body.record === 'object' ? body.record : {};
  const clientRecordJson = JSON.stringify(clientRecord);
  if (clientRecordJson.length > 750_000) {
    throw { status: 413, message: 'Research archive is too large' };
  }

  // The archive is a self-contained snapshot. New research runs can keep
  // writing to the live conversation and behavior tables without changing it.
  const [conversationResult, behaviorResult] = await Promise.all([
    env.db.prepare(`
      SELECT id, session_id, conversation_id, ai_type, role, content, product_id, metadata_json, timestamp
      FROM ai_conversations
      WHERE user_id = ? AND conversation_id IN (?, ?)
      ORDER BY timestamp ASC, id ASC
    `).bind(session.userId, ...conversationIds).all(),
    env.db.prepare(`
      SELECT id, session_id, behavior_type, product_id, duration_ms, metadata_json, timestamp
      FROM user_behaviors
      WHERE user_id = ? AND json_extract(metadata_json, '$.researchRunId') = ?
      ORDER BY timestamp ASC, id ASC
    `).bind(session.userId, researchRunId).all(),
  ]);

  const profile = clientRecord.profile && typeof clientRecord.profile === 'object'
    ? clientRecord.profile
    : {};
  const snapshotJson = JSON.stringify({
    schemaVersion: 1,
    researchRunId,
    clientRecord,
    conversations: conversationResult.results || [],
    behaviors: behaviorResult.results || [],
  });
  const archiveId = `research_archive_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const insertResult = await env.db.prepare(`
    INSERT OR IGNORE INTO completed_research_archives (
      id, user_id, research_run_id, final_decision, selected_product_id,
      profile_json, snapshot_json, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    archiveId,
    session.userId,
    researchRunId,
    finalDecision,
    clientRecord.selectedProductId ? String(clientRecord.selectedProductId) : null,
    JSON.stringify(profile),
    snapshotJson,
  ).run();

  const archive = await env.db.prepare(`
    SELECT id, completed_at FROM completed_research_archives
    WHERE user_id = ? AND research_run_id = ?
  `).bind(session.userId, researchRunId).first();

  return json({
    archiveId: archive?.id,
    completedAt: archive?.completed_at,
    alreadyArchived: Number(insertResult.meta?.changes || 0) === 0,
  });
}

// The R2 object deliberately remains private. This authenticated route is the
// stable link stored in D1 and prevents raw transcripts and profile data from
// being exposed through a public bucket URL.
export async function getCompletedResearchArchiveContent({ request, env, params }) {
  const { session } = await requireStandardUser(request, env);
  const archiveId = String(params.archiveId || '').trim();
  if (!/^research_archive_[a-zA-Z0-9_]+$/.test(archiveId)) {
    throw { status: 400, message: 'A valid research archive ID is required' };
  }

  const archive = await env.db.prepare(`
    SELECT r2_archive_key
    FROM completed_research_archives
    WHERE id = ? AND user_id = ?
  `).bind(archiveId, session.userId).first();
  if (!archive?.r2_archive_key) {
    throw { status: 404, message: 'Research archive content not found' };
  }
  if (!env.zero_1_store) {
    throw { status: 503, message: 'Research archive storage is not configured' };
  }

  const object = await env.zero_1_store.get(archive.r2_archive_key);
  if (!object) throw { status: 404, message: 'Research archive content not found' };

  const headers = new Headers();
  headers.set('content-type', object.httpMetadata?.contentType || 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('content-disposition', `attachment; filename="${archiveId}.json"`);
  return new Response(object.body, { headers });
}

export async function persistCompletedResearchContent(env, archive, report, options = {}) {
  if (!archive?.id) throw new Error('Research archive record is required');
  if (!env.zero_1_store) {
    throw { status: 503, message: 'Research archive storage is not configured' };
  }

  const snapshot = parseArchiveJson(archive.snapshot_json, {});
  const generatedAt = options.generatedAt || archive.report_generated_at || new Date().toISOString();
  const reportModel = options.reportModel || archive.report_model || 'unknown';
  const r2ArchiveKey = archive.r2_archive_key || `archive/${archive.id}.json`;
  const r2ArchiveUrl = `/api/research/archive/${encodeURIComponent(archive.id)}/content`;
  const content = {
    schemaVersion: 2,
    archive: {
      id: archive.id,
      researchRunId: archive.research_run_id,
      finalDecision: archive.final_decision,
      selectedProductId: archive.selected_product_id || null,
      completedAt: archive.completed_at,
      reportGeneratedAt: generatedAt,
      reportModel,
    },
    rawResearchMaterial: snapshot,
    report,
  };

  await env.zero_1_store.put(r2ArchiveKey, JSON.stringify(content), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      archiveId: archive.id,
      researchRunId: archive.research_run_id,
      contentSchemaVersion: '2',
    },
  });

  await env.db.prepare(`
    UPDATE completed_research_archives
    SET report_json = ?, report_generated_at = ?, report_model = ?,
        r2_archive_key = ?, r2_archive_url = ?, r2_archived_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).bind(
    JSON.stringify(report), generatedAt, reportModel,
    r2ArchiveKey, r2ArchiveUrl, archive.id, archive.user_id,
  ).run();

  return { r2ArchiveKey, r2ArchiveUrl };
}

function parseArchiveJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function requireResearchRunId(value) {
  const researchRunId = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(researchRunId)) {
    throw { status: 400, message: 'A valid research run ID is required' };
  }
  return researchRunId;
}

function researchConversationIds(researchRunId) {
  return [
    `research-${researchRunId}-seller`,
    `research-${researchRunId}-guardian`,
  ];
}

export async function getRecommendations({ request, env, url }) {
  await requireStandardUser(request, env);
  const locale = getLocaleFromRequest(request, url);
  const body = await readJsonBody(request);
  const profile = body?.profile && typeof body.profile === 'object' ? body.profile : {};
  const { results } = await env.db.prepare(`
    SELECT * FROM products
    ORDER BY is_hot DESC, sales_count DESC, rating DESC, updated_at DESC
  `).all();

  const recommendations = results
    .map((product) => scoreResearchProduct(normalizeProduct(product, locale), profile, locale))
    .sort((left, right) => right.matchScore - left.matchScore || Number(right.rating || 0) - Number(left.rating || 0));

  return json({
    products: recommendations,
    source: 'product-database',
    note: locale === 'en-US'
      ? 'The complete product database is provided as a hidden catalog. Seller AI chooses and identifies recommended products after reading the user profile.'
      : '完整商品数据库会作为隐藏目录提供给 AI。卖家 AI 读取用户信息后选择并标识推荐商品。',
  });
}

// The input field is free-form, so literal keyword matching alone often puts a
// cheap but unrelated item above the product type the participant actually
// named (for example, "电脑" versus a catalog entry called "笔记本"). These
// aliases give product-type intent a stronger signal than popularity or price.
const RESEARCH_NEED_INTENTS = [
  { zh: '笔记本电脑', en: 'laptop', aliases: ['电脑', '笔记本', '轻薄本', 'laptop', 'notebook', 'macbook'], productTerms: ['笔记本', '轻薄本', 'laptop', 'notebook', 'macbook'] },
  { zh: '手机', en: 'phone', aliases: ['手机', 'iphone', '安卓', 'android', 'phone', 'mobile'], productTerms: ['手机', 'iphone', 'android', 'phone', 'galaxy', 'find x'] },
  { zh: '平板', en: 'tablet', aliases: ['平板', 'ipad', 'tablet', 'pad'], productTerms: ['平板', 'ipad', 'tablet', 'matepad', 'galaxy tab'] },
  { zh: '耳机', en: 'headphones', aliases: ['耳机', '降噪', 'headphone', 'headset', 'noise cancelling'], productTerms: ['耳机', '降噪', 'headphone', 'wh-'] },
  { zh: '音箱', en: 'speaker', aliases: ['音箱', '音响', 'speaker'], productTerms: ['音箱', '音响', 'speaker', 'soundlink', 'flip'] },
  { zh: '显示器', en: 'monitor', aliases: ['显示器', 'monitor'], productTerms: ['显示器', 'monitor'] },
  { zh: '相机', en: 'camera', aliases: ['相机', '摄影', '拍摄', 'camera', 'gopro'], productTerms: ['相机', 'camera', 'gopro', '影像'] },
  { zh: '游戏主机', en: 'game console', aliases: ['游戏机', '游戏主机', 'switch', 'console'], productTerms: ['游戏主机', 'switch', 'console', '游戏'] },
  { zh: '智能手表', en: 'smartwatch', aliases: ['手表', '智能表', '智能手表', 'watch', 'smartwatch'], productTerms: ['手表', 'watch'] },
  { zh: '鞋', en: 'shoes', aliases: ['鞋', '跑鞋', '运动鞋', 'shoe', 'sneaker'], productTerms: ['鞋', 'shoe', 'sneaker', 'xt-6', '574'] },
  { zh: '包', en: 'bag', aliases: ['包', '双肩包', '手提包', '背包', 'bag', 'backpack', 'tote'], productTerms: ['包', 'bag', 'backpack', 'tote', 'kånken'] },
  { zh: '护肤', en: 'skincare', aliases: ['护肤', '面霜', '乳液', '保湿', '修护', 'skincare', 'cream', 'lotion'], productTerms: ['面霜', '乳液', '保湿', '修护', 'cream', 'lotion', 'b5'] },
  { zh: '防晒', en: 'sunscreen', aliases: ['防晒', 'sunscreen', 'uv'], productTerms: ['防晒', 'sunscreen', 'uv'] },
  { zh: '美发工具', en: 'hair tool', aliases: ['吹风机', '直发器', '卷发棒', '美发', 'hair dryer', 'hair styler', 'curling'], productTerms: ['吹风机', '直发器', '卷发棒', '美发', 'hair dryer', 'hair styler', 'curling'] },
  { zh: '咖啡机', en: 'coffee machine', aliases: ['咖啡机', 'coffee machine', 'espresso'], productTerms: ['咖啡机', 'coffee machine', 'espresso', 'nespresso', 'magnifica'] },
  { zh: '咖啡', en: 'coffee', aliases: ['咖啡', 'coffee'], productTerms: ['咖啡', 'coffee'] },
  { zh: '扫地机器人', en: 'robot vacuum', aliases: ['扫地机器人', '机器人吸尘器', 'robot vacuum'], productTerms: ['扫地机器人', 'robot vacuum', 'irobot', '石头', '科沃斯'] },
  { zh: '零食', en: 'snacks', aliases: ['零食', '坚果', '巧克力', 'snack', 'nuts', 'chocolate'], productTerms: ['零食', '坚果', '巧克力', 'snack', 'nuts', 'chocolate'] },
  { zh: '果汁', en: 'juice', aliases: ['果汁', 'juice'], productTerms: ['果汁', 'juice'] },
  { zh: '学习与阅读', en: 'study and reading', aliases: ['学习', '阅读', '上课', '笔记', 'study', 'reading'], productTerms: ['笔记本', '平板', '阅读器', 'kindle', '台灯', '显示器', 'laptop', 'tablet', 'e-reader', 'desk lamp', 'monitor'], weight: 30 },
  { zh: '办公', en: 'work', aliases: ['办公', '工作', '通勤', 'office', 'work'], productTerms: ['笔记本', '鼠标', '显示器', '双肩包', '手提包', 'laptop', 'mouse', 'monitor', 'backpack', 'tote'], weight: 30 },
  { zh: '创作与视频', en: 'creation and video', aliases: ['剪视频', '视频剪辑', '创作', '拍片', 'edit video', 'video editing', 'creation'], productTerms: ['笔记本', '平板', '显示器', '相机', '手机', 'laptop', 'tablet', 'monitor', 'camera', 'phone'], weight: 34 },
  { zh: '旅行与户外', en: 'travel and outdoors', aliases: ['旅行', '出行', '户外', '露营', 'travel', 'outdoor', 'camping'], productTerms: ['双肩包', '音箱', '耳机', '相机', '跑鞋', '保温杯', 'backpack', 'speaker', 'headphone', 'camera', 'shoes', 'tumbler'], weight: 30 },
  { zh: '居家', en: 'home use', aliases: ['居家', '家里', '家用', 'home'], productTerms: ['家居服', '保鲜盒', '休闲椅', '台灯', '咖啡机', '扫地机器人', 'loungewear', 'food container', 'armchair', 'desk lamp', 'coffee machine', 'robot vacuum'], weight: 30 },
];

function scoreResearchProduct(product, profile, locale) {
  const need = String(profile.currentNeed || '').trim().toLowerCase();
  const target = String(profile.purchaseTarget || '').trim().toLowerCase();
  const haystack = [
    product.name,
    product.subtitle,
    product.description,
    product.category_id,
    ...(Array.isArray(product.tags) ? product.tags : []),
    ...Object.values(product.specs || {}),
  ].join(' ').toLowerCase();
  const terms = splitSearchTerms(`${need} ${target}`);
  const matchedTerms = terms.filter((term) => haystack.includes(term));
  const matchedIntents = RESEARCH_NEED_INTENTS.filter((intent) =>
    intent.aliases.some((alias) => need.includes(alias))
      && intent.productTerms.some((term) => haystack.includes(term)),
  );

  // Product type is the primary relevance signal; secondary scene/feature
  // matches and budget only refine the order within that type.
  let matchScore = matchedIntents.reduce((score, intent) => score + Number(intent.weight || 80), 0)
    + matchedTerms.length * 12;
  const maxBudget = Number(profile.maxBudget || 0);
  const price = Number(product.price || 0);

  if (maxBudget > 0) {
    if (price <= maxBudget) matchScore += 24;
    else if (price <= maxBudget * 1.2) matchScore += 4;
    else matchScore -= 18;
  }

  if (String(profile.urgency || '') === 'high' && Number(product.stock || 0) > 0) matchScore += 3;
  if (String(profile.purchaseTarget || '') === 'gift' && /礼|gift|套装|节日|纪念/.test(haystack)) matchScore += 8;
  if (String(profile.purchaseTarget || '') === 'self' && !/礼|gift/.test(haystack)) matchScore += 3;

  const matchReasons = [];
  if (matchedIntents.length) {
    const intentLabels = matchedIntents.map((intent) => locale === 'en-US' ? intent.en : intent.zh);
    matchReasons.push(locale === 'en-US'
      ? `Matches your requested product type or use: ${intentLabels.slice(0, 2).join(', ')}`
      : `符合你提出的品类或使用需求：${intentLabels.slice(0, 2).join('、')}`);
  }
  if (matchedTerms.length) {
    matchReasons.push(locale === 'en-US'
      ? `Matches your stated need: ${matchedTerms.slice(0, 3).join(', ')}`
      : `和你的需求关键词匹配：${matchedTerms.slice(0, 3).join('、')}`);
  }
  if (maxBudget > 0 && price <= maxBudget) {
    matchReasons.push(locale === 'en-US' ? 'Within your stated budget' : '价格在你填写的预算内');
  } else if (maxBudget > 0 && price > maxBudget) {
    matchReasons.push(locale === 'en-US' ? 'Above your stated budget; verify affordability' : '价格超过你填写的预算，需要确认是否能承受');
  }
  if (!matchReasons.length) {
    matchReasons.push(locale === 'en-US' ? 'Selected from the available product database' : '从当前商品数据库中筛选');
  }

  return {
    ...product,
    matchScore,
    matchReasons,
  };
}

function splitSearchTerms(value) {
  const chunks = String(value || '')
    .split(/[\s,，。；;、/\\|:：!?！？()（）\[\]【】]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  const chineseBigrams = [];
  chunks.forEach((chunk) => {
    if (!/[\u4e00-\u9fff]/.test(chunk)) return;
    for (let index = 0; index < chunk.length - 1; index += 1) {
      const pair = chunk.slice(index, index + 2);
      if (/^[\u4e00-\u9fff]{2}$/.test(pair)) chineseBigrams.push(pair);
    }
  });
  return Array.from(new Set([...chunks, ...chineseBigrams])).slice(0, 20);
}

export async function trackBehavior({ request, env }) {
  const token = requireAuth(request);
  const session = await getSession(token, env);
  const body = await request.json();
  const { behaviorType, productId, durationMs, metadata } = body;

  if (session.role === 'admin') {
    return json({ message: "Admin behavior ignored", skipped: true });
  }

  if (!behaviorType) {
    throw { status: 400, message: "Behavior type required" };
  }

  if (behaviorType === 'click') {
    return json({ message: "Click behavior ignored", skipped: true });
  }

  const validTypes = [
    'view_product',
    'add_cart',
    'remove_cart',
    'place_order',
    'chat_ai',
    'search',
    'intervention_check',
    'pressure_probe',
  ];
  if (!validTypes.includes(behaviorType)) {
    throw { status: 400, message: "Invalid behavior type" };
  }

  const behaviorId = `beh_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const reservedFields = new Set(['behaviorType', 'productId', 'durationMs', 'metadata']);
  const derivedMetadata = Object.fromEntries(
    Object.entries(body).filter(([key]) => !reservedFields.has(key)),
  );
  const metadataJson = JSON.stringify({
    ...derivedMetadata,
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
  });

  await env.db.prepare(`
    INSERT INTO user_behaviors (id, user_id, session_id, behavior_type, product_id, duration_ms, metadata_json, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    behaviorId,
    session.userId,
    token,
    behaviorType,
    productId || null,
    durationMs || null,
    metadataJson
  ).run();

  return json({ message: "Behavior tracked", behaviorId });
}

export async function getSummary({ request, env, url }) {
  await requireAdmin(request, env);
  const locale = getLocaleFromRequest(request, url);

  const userRow = await env.db.prepare("SELECT COUNT(*) as value FROM users WHERE role = 'user'").first();
  const orderRow = await env.db.prepare("SELECT COUNT(*) as value FROM orders o JOIN users u ON u.id = o.user_id WHERE u.role = 'user'").first();
  const revenueRow = await env.db.prepare("SELECT COALESCE(SUM(o.final_amount), 0) as value FROM orders o JOIN users u ON u.id = o.user_id WHERE u.role = 'user' AND o.status != 'cancelled'").first();
  const conversationRow = await env.db.prepare("SELECT COUNT(DISTINCT ac.conversation_id) as value FROM ai_conversations ac JOIN users u ON u.id = ac.user_id WHERE u.role = 'user'").first();
  const productRow = await env.db.prepare("SELECT COUNT(*) as value FROM products").first();
  const behaviorRow = await env.db.prepare("SELECT COUNT(*) as value FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user'").first();
  const sessionRow = await env.db.prepare("SELECT COUNT(DISTINCT ub.session_id) as value FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user'").first();
  const todayBehaviorRow = await env.db.prepare("SELECT COUNT(*) as value FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user' AND date(ub.timestamp) = date('now')").first();
  const todayConversationRow = await env.db.prepare("SELECT COUNT(DISTINCT ac.conversation_id) as value FROM ai_conversations ac JOIN users u ON u.id = ac.user_id WHERE u.role = 'user' AND date(ac.timestamp) = date('now')").first();
  const behaviorBreakdownRows = await env.db.prepare(
    `SELECT ub.behavior_type, COUNT(*) as value
     FROM user_behaviors ub
     JOIN users u ON u.id = ub.user_id
     WHERE u.role = 'user'
     GROUP BY ub.behavior_type
     ORDER BY value DESC`
  ).all();
  const topProductRows = await env.db.prepare(
    `SELECT p.id, p.name, p.name_en, p.price, p.rating, p.stock,
            COUNT(ub.id) as view_count
     FROM products p
     LEFT JOIN user_behaviors ub ON ub.product_id = p.id
       AND ub.behavior_type = 'view_product'
       AND ub.user_id IN (SELECT id FROM users WHERE role = 'user')
     GROUP BY p.id
     ORDER BY view_count DESC, p.sales_count DESC
     LIMIT 6`
  ).all();
  const dailyBehaviorRows = await env.db.prepare(
    `SELECT date(ub.timestamp) as day, COUNT(*) as value
     FROM user_behaviors ub
     JOIN users u ON u.id = ub.user_id
     WHERE u.role = 'user' AND ub.timestamp >= date('now', '-6 days')
     GROUP BY date(ub.timestamp)
     ORDER BY day ASC`
  ).all();
  const recentSessionRows = await env.db.prepare(
    `SELECT ub.session_id,
            MAX(ub.timestamp) as last_seen,
            COUNT(*) as event_count,
            COUNT(DISTINCT ub.user_id) as user_count
     FROM user_behaviors ub
     JOIN users u ON u.id = ub.user_id
     WHERE u.role = 'user'
     GROUP BY ub.session_id
     ORDER BY last_seen DESC
     LIMIT 8`
  ).all();
  const aiUsageRows = await env.db.prepare(
    `SELECT ac.ai_type, COUNT(*) as value
     FROM ai_conversations ac
     JOIN users u ON u.id = ac.user_id
     WHERE u.role = 'user' AND ac.role = 'user'
     GROUP BY ac.ai_type`
  ).all();
  const interventionRows = await env.db.prepare(
    `SELECT json_extract(ub.metadata_json, '$.strategy') as strategy,
            COUNT(*) as value
     FROM user_behaviors ub
     JOIN users u ON u.id = ub.user_id
     WHERE u.role = 'user' AND ub.behavior_type = 'intervention_check'
     GROUP BY strategy
     ORDER BY value DESC`
  ).all();
  const pressureRow = await env.db.prepare(
    `SELECT COUNT(*) as value,
            AVG(CAST(json_extract(ub.metadata_json, '$.score') AS REAL)) as avg_score
     FROM user_behaviors ub
     JOIN users u ON u.id = ub.user_id
     WHERE u.role = 'user' AND ub.behavior_type = 'pressure_probe'`
  ).first();
  const pressureLevelRows = await env.db.prepare(
    `SELECT COALESCE(json_extract(ub.metadata_json, '$.level'), 'unknown') as level,
            COUNT(*) as value,
            AVG(CAST(json_extract(ub.metadata_json, '$.score') AS REAL)) as avg_score
     FROM user_behaviors ub
     JOIN users u ON u.id = ub.user_id
     WHERE u.role = 'user' AND ub.behavior_type = 'pressure_probe'
     GROUP BY level
     ORDER BY value DESC`
  ).all();
  const pressureCueRows = await env.db.prepare(
    `SELECT cue.value as cue, COUNT(*) as value
     FROM user_behaviors ub
     JOIN users u ON u.id = ub.user_id,
          json_each(ub.metadata_json, '$.cues') cue
     WHERE u.role = 'user' AND ub.behavior_type = 'pressure_probe'
     GROUP BY cue.value
     ORDER BY value DESC
     LIMIT 6`
  ).all();

  return json({
    totals: {
      users: Number(userRow?.value || 0),
      orders: Number(orderRow?.value || 0),
      revenue: Number(revenueRow?.value || 0),
      conversations: Number(conversationRow?.value || 0),
      products: Number(productRow?.value || 0),
      behaviors: Number(behaviorRow?.value || 0),
      sessions: Number(sessionRow?.value || 0),
      todayBehaviors: Number(todayBehaviorRow?.value || 0),
      todayConversations: Number(todayConversationRow?.value || 0),
    },
    behaviorBreakdown: behaviorBreakdownRows.results.map((row) => ({
      key: row.behavior_type,
      value: row.value,
    })),
    topProducts: topProductRows.results.map((row) => ({
      ...row,
      name: locale === 'en-US' && row.name_en ? row.name_en : row.name,
      view_count: Number(row.view_count || 0),
    })),
    dailyBehavior: dailyBehaviorRows.results.map((row) => ({
      day: row.day,
      value: Number(row.value || 0),
    })),
    recentSessions: recentSessionRows.results.map((row) => ({
      ...row,
      event_count: Number(row.event_count || 0),
      user_count: Number(row.user_count || 0),
    })),
    aiUsage: aiUsageRows.results.map((row) => ({
      aiType: row.ai_type,
      value: Number(row.value || 0),
    })),
    interventions: interventionRows.results.map((row) => ({
      strategy: row.strategy || 'unknown',
      value: Number(row.value || 0),
    })),
    pressure: {
      total: Number(pressureRow?.value || 0),
      avgScore: Math.round(Number(pressureRow?.avg_score || 0)),
      levels: pressureLevelRows.results.map((row) => ({
        level: row.level || 'unknown',
        value: Number(row.value || 0),
        avgScore: Math.round(Number(row.avg_score || 0)),
      })),
      cues: pressureCueRows.results.map((row) => ({
        cue: row.cue || 'unknown',
        value: Number(row.value || 0),
      })),
    },
  });
}
