import { json, readJsonBody, requireAdmin, requireAuth, requireStandardUser, getSession } from "../../app/http.js";
import { getLocaleFromRequest } from "../shop/utils.js";
import { normalizeProduct } from "../shop/utils.js";

export async function clearUserResearchData({ request, env, url }) {
  const { session } = await requireStandardUser(request, env);
  const researchRunId = requireResearchRunId(url.searchParams.get('runId'));

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
      WHERE user_id = ? AND conversation_id LIKE ?
    `).bind(session.userId, `research-${researchRunId}-%`),
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
      WHERE user_id = ? AND conversation_id LIKE ?
      ORDER BY timestamp ASC, id ASC
    `).bind(session.userId, `research-${researchRunId}-%`).all(),
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

function requireResearchRunId(value) {
  const researchRunId = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(researchRunId)) {
    throw { status: 400, message: 'A valid research run ID is required' };
  }
  return researchRunId;
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
  let matchScore = matchedTerms.length * 12;
  const maxBudget = Number(profile.maxBudget || 0);
  const price = Number(product.price || 0);

  if (maxBudget > 0) {
    if (price <= maxBudget) matchScore += 30;
    else if (price <= maxBudget * 1.2) matchScore += 8;
    else matchScore -= 24;
  }

  if (String(profile.urgency || '') === 'high' && Number(product.stock || 0) > 0) matchScore += 3;
  if (String(profile.purchaseTarget || '') === 'gift' && /礼|gift|套装|节日|纪念/.test(haystack)) matchScore += 8;
  if (String(profile.purchaseTarget || '') === 'self' && !/礼|gift/.test(haystack)) matchScore += 3;

  const matchReasons = [];
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
