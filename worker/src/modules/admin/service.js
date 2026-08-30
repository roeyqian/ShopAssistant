import { json, createId, readJsonBody, requireAdmin } from "../../app/http.js";
import { testDeepSeekConnection } from "../ai/deepseek.js";
import { getLocaleFromRequest } from "../shop/utils.js";

export async function getAiConfig({ request, env }) {
  await requireAdmin(request, env);

  const config = await env.db.prepare("SELECT * FROM ai_config WHERE id = 1").first();

  if (!config) {
    return json({
      deepseek_api_key: '',
      deepseek_base_url: 'https://api.deepseek.com',
      deepseek_model: 'deepseek-chat',
      seller_ai_enabled: true,
      guardian_ai_enabled: true,
      ai_temperature: 0.7,
    });
  }

  return json(config);
}

export async function updateAiConfig({ request, env }) {
  const session = await requireAdmin(request, env);
  const { deepseek_api_key, deepseek_base_url, deepseek_model, seller_ai_enabled, guardian_ai_enabled, ai_temperature } = await readJsonBody(request);
  const temperature = normalizeTemperature(ai_temperature);

  await env.db.prepare(`
    INSERT OR REPLACE INTO ai_config
    (id, deepseek_api_key, deepseek_base_url, deepseek_model, seller_ai_enabled, guardian_ai_enabled, ai_temperature, updated_at, updated_by)
    VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).bind(
    String(deepseek_api_key ?? ''),
    deepseek_base_url || 'https://api.deepseek.com',
    deepseek_model || 'deepseek-chat',
    seller_ai_enabled ? 1 : 0,
    guardian_ai_enabled ? 1 : 0,
    temperature,
    session.userId
  ).run();

  return json({ message: "AI configuration updated successfully" });
}

export async function testAiConfig({ request, env }) {
  await requireAdmin(request, env);

  const savedConfig = await env.db.prepare("SELECT * FROM ai_config WHERE id = 1").first();
  const body = await readJsonBody(request);
  const hasSubmittedKey = Object.prototype.hasOwnProperty.call(body, 'deepseek_api_key');
  const deepseekApiKey = hasSubmittedKey
    ? String(body.deepseek_api_key || '').trim()
    : String(savedConfig?.deepseek_api_key || '').trim();
  const deepseekBaseUrl = String(body.deepseek_base_url || savedConfig?.deepseek_base_url || 'https://api.deepseek.com').trim();
  const deepseekModel = String(body.deepseek_model || savedConfig?.deepseek_model || 'deepseek-chat').trim();

  const config = {
    deepseek_api_key: hasSubmittedKey ? deepseekApiKey : savedConfig?.deepseek_api_key || '',
    deepseek_base_url: deepseekBaseUrl || 'https://api.deepseek.com',
    deepseek_model: deepseekModel || 'deepseek-chat',
    ai_temperature: normalizeTemperature(body.ai_temperature ?? savedConfig?.ai_temperature),
  };

  if (!config.deepseek_api_key) {
    throw { status: 400, message: "DeepSeek API Key is required" };
  }

  const result = await testDeepSeekConnection(config);

  return json({
    ok: result.ok,
    model: result.model,
    message: "AI connection test succeeded"
  });
}

export async function getStats({ request, env }) {
  await requireAdmin(request, env);

  const { total_users } = await env.db.prepare("SELECT COUNT(*) as total_users FROM users WHERE role = 'user'").first();
  const { total_orders } = await env.db.prepare("SELECT COUNT(*) as total_orders FROM orders o JOIN users u ON u.id = o.user_id WHERE u.role = 'user'").first();
  const { total_revenue } = await env.db.prepare("SELECT COALESCE(SUM(o.final_amount), 0) as total_revenue FROM orders o JOIN users u ON u.id = o.user_id WHERE u.role = 'user' AND o.status != 'cancelled'").first();
  const { total_conversations } = await env.db.prepare("SELECT COUNT(DISTINCT ac.conversation_id) as total_conversations FROM ai_conversations ac JOIN users u ON u.id = ac.user_id WHERE u.role = 'user'").first();
  const { total_products } = await env.db.prepare("SELECT COUNT(*) as total_products FROM products").first();
  const { total_behaviors } = await env.db.prepare("SELECT COUNT(*) as total_behaviors FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user'").first();
  const { view_product_count } = await env.db.prepare("SELECT COUNT(*) as view_product_count FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user' AND ub.behavior_type = 'view_product'").first();
  const { add_cart_count } = await env.db.prepare("SELECT COUNT(*) as add_cart_count FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user' AND ub.behavior_type = 'add_cart'").first();
  const { remove_cart_count } = await env.db.prepare("SELECT COUNT(*) as remove_cart_count FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user' AND ub.behavior_type = 'remove_cart'").first();
  const { place_order_count } = await env.db.prepare("SELECT COUNT(*) as place_order_count FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user' AND ub.behavior_type = 'place_order'").first();
  const { chat_ai_count } = await env.db.prepare("SELECT COUNT(*) as chat_ai_count FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user' AND ub.behavior_type = 'chat_ai'").first();
  const { search_count } = await env.db.prepare("SELECT COUNT(*) as search_count FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user' AND ub.behavior_type = 'search'").first();
  const { intervention_check_count } = await env.db.prepare("SELECT COUNT(*) as intervention_check_count FROM user_behaviors ub JOIN users u ON u.id = ub.user_id WHERE u.role = 'user' AND ub.behavior_type = 'intervention_check'").first();

  return json({
    total_users,
    total_orders,
    total_revenue,
    total_conversations,
    total_products,
    total_behaviors,
    behavior_breakdown: [
      { key: 'view_product', value: view_product_count },
      { key: 'add_cart', value: add_cart_count },
      { key: 'remove_cart', value: remove_cart_count },
      { key: 'place_order', value: place_order_count },
      { key: 'chat_ai', value: chat_ai_count },
      { key: 'search', value: search_count },
      { key: 'intervention_check', value: intervention_check_count }
    ]
  });
}

export async function getOrders({ request, env, url }) {
  await requireAdmin(request, env);

  const limit = clampInt(url.searchParams.get('limit'), 25, 1, 100);
  const status = url.searchParams.get('status');

  let where = "WHERE u.role = 'user'";
  const params = [];
  if (status) {
    where += " AND o.status = ?";
    params.push(status);
  }

  const { results } = await env.db.prepare(`
    SELECT o.id, o.order_no, o.user_id, o.total_amount, o.final_amount, o.status,
           o.created_at, o.paid_at, o.shipped_at, o.completed_at, o.cancelled_at,
           u.username, u.email,
           COUNT(DISTINCT oi.id) as item_count,
           COUNT(DISTINCT oe.id) as event_count
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN order_events oe ON oe.order_id = o.id
    ${where}
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT ?
  `).bind(...params, limit).all();

  return json({
    orders: results.map((order) => ({
      ...order,
      item_count: Number(order.item_count || 0),
      event_count: Number(order.event_count || 0),
    })),
  });
}

export async function getResearchArchives({ request, env, url }) {
  await requireAdmin(request, env);
  const limit = clampInt(url.searchParams.get('limit'), 20, 1, 100);

  const { results } = await env.db.prepare(`
    SELECT a.id, a.research_run_id, a.final_decision, a.selected_product_id,
           a.completed_at, a.report_generated_at, a.r2_archived_at,
           u.username, u.email,
           p.name AS product_name, p.name_en AS product_name_en
    FROM completed_research_archives a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN products p ON p.id = a.selected_product_id
    WHERE u.role = 'user'
    ORDER BY a.completed_at DESC, a.id DESC
    LIMIT ?
  `).bind(limit).all();

  return json({
    archives: results.map((archive) => ({
      ...archive,
      product_name: localizedProductName({ name: archive.product_name, name_en: archive.product_name_en }, getLocaleFromRequest(request, url)),
      has_report: Boolean(archive.report_generated_at),
      has_raw_material: Boolean(archive.r2_archived_at),
    })),
  });
}

export async function getResearchArchiveDetail({ request, env, params, url }) {
  await requireAdmin(request, env);
  const archiveId = String(params.id || '').trim();
  if (!/^research_archive_[a-zA-Z0-9_]+$/.test(archiveId)) {
    throw { status: 400, message: 'A valid research archive ID is required' };
  }

  const archive = await env.db.prepare(`
    SELECT a.id, a.research_run_id, a.final_decision, a.selected_product_id,
           a.completed_at, a.report_generated_at, a.report_model, a.r2_archived_at,
           a.profile_json, a.snapshot_json, a.report_json,
           u.username, u.email,
           p.name AS product_name, p.name_en AS product_name_en
    FROM completed_research_archives a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN products p ON p.id = a.selected_product_id
    WHERE a.id = ? AND u.role = 'user'
  `).bind(archiveId).first();

  if (!archive) throw { status: 404, message: 'Research archive not found' };

  return json({
    archive: {
      ...archive,
      product_name: localizedProductName({ name: archive.product_name, name_en: archive.product_name_en }, getLocaleFromRequest(request, url)),
      profile: parseJson(archive.profile_json, {}),
      snapshot: parseJson(archive.snapshot_json, {}),
      report: parseJson(archive.report_json, null),
      has_report: Boolean(archive.report_generated_at),
      has_raw_material: Boolean(archive.r2_archived_at),
      profile_json: undefined,
      snapshot_json: undefined,
      report_json: undefined,
    },
  });
}

export async function getOrderDetail({ request, env, params, url }) {
  await requireAdmin(request, env);
  const locale = getLocaleFromRequest(request, url);

  const order = await env.db.prepare(`
    SELECT o.*, u.username, u.email
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE o.id = ? AND u.role = 'user'
  `).bind(params.id).first();

  if (!order) {
    throw { status: 404, message: "Record not found" };
  }

  const { results: items } = await env.db.prepare(
    `SELECT oi.*, p.name AS current_name, p.name_en AS current_name_en
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.subtotal DESC`
  ).bind(params.id).all();

  const { results: events } = await env.db.prepare(
    `SELECT oe.*, u.username AS actor_name
     FROM order_events oe
     LEFT JOIN users u ON u.id = oe.actor_user_id
     WHERE oe.order_id = ?
     ORDER BY oe.created_at ASC`
  ).bind(params.id).all();

  return json({
    order: {
      ...order,
      shippingAddress: parseJson(order.shipping_address_json, {}),
      items: items.map((item) => ({
        ...item,
        snapshot_product_name: item.product_name,
        product_name: localizedProductName(
          { name: item.current_name || item.product_name, name_en: item.current_name_en },
          locale,
        ),
      })),
      events: events.map((event) => ({
        ...event,
        note: event.note || '',
      })),
    },
  });
}

function localizedProductName(product, locale) {
  return locale === 'en-US' && product.name_en ? product.name_en : product.name;
}

export async function updateOrderStatus({ request, env, params }) {
  const session = await requireAdmin(request, env);
  const body = await readJsonBody(request);
  const status = String(body.status || '').trim();
  const note = String(body.note || '').trim();

  if (!VALID_ORDER_STATUSES.includes(status)) {
    throw { status: 400, message: "Invalid record status" };
  }

  const order = await env.db.prepare("SELECT * FROM orders WHERE id = ?").bind(params.id).first();
  if (!order) {
    throw { status: 404, message: "Record not found" };
  }

  const timestampField = STATUS_TIMESTAMPS[status];
  const timestampSql = timestampField ? `${timestampField} = datetime('now'),` : '';

  await env.db.prepare(`
    UPDATE orders
    SET status = ?, ${timestampSql}
        remark = COALESCE(remark, ?)
    WHERE id = ?
  `).bind(status, note || order.remark || '', params.id).run();

  await env.db.prepare(`
    INSERT INTO order_events (id, order_id, event_type, status, note, actor_user_id, created_at)
    VALUES (?, ?, 'status_changed', ?, ?, ?, datetime('now'))
  `).bind(createId("ordevt"), params.id, status, note || `Research record marked as ${status}`, session.userId).run();

  return json({
    message: "Record updated",
    orderId: params.id,
    status,
  });
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

const VALID_ORDER_STATUSES = ['completed', 'cancelled'];
const STATUS_TIMESTAMPS = {
  completed: 'completed_at',
  cancelled: 'cancelled_at',
};

function normalizeTemperature(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 2) return 0.7;
  return Math.round(number * 100) / 100;
}
