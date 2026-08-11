const API_BASE = '/api';
const LOCALE_STORAGE_KEY = 'shopassistant_locale';
const ACCOUNT_STATE_STORAGE_PREFIX = 'shopassistant.account';
const LEGACY_UNSCOPED_STORAGE_KEYS = ['shopassistant_research_draft'];
export const AUTH_EXPIRED_EVENT = 'shopassistant:auth-expired';

function getRequestLocale() {
  return localStorage.getItem(LOCALE_STORAGE_KEY) || navigator.language || 'zh-CN';
}

export const TokenManager = {
  get() {
    return localStorage.getItem('auth_token');
  },
  set(token) {
    localStorage.setItem('auth_token', token);
  },
  clear() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  },
  getUser() {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  },
};

function accountIdFrom(value) {
  if (value && typeof value === 'object') return String(value.id || '').trim();
  return String(value || '').trim();
}

function accountStateKey(namespace, account) {
  const accountId = accountIdFrom(account ?? TokenManager.getUser());
  if (!accountId || !namespace) return '';
  return `${ACCOUNT_STATE_STORAGE_PREFIX}:${encodeURIComponent(String(namespace))}:${encodeURIComponent(accountId)}`;
}

/**
 * Persistent state that belongs to the signed-in account must go through this
 * API. The active auth token remains global because only one session is active
 * in a browser tab; user data is never stored under a shared key.
 */
export const AccountState = {
  accountId: accountIdFrom,
  has(namespace, account = TokenManager.getUser()) {
    const key = accountStateKey(namespace, account);
    try {
      return Boolean(key && localStorage.getItem(key));
    } catch {
      return false;
    }
  },
  read(namespace, account = TokenManager.getUser()) {
    const key = accountStateKey(namespace, account);
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore storage failures; account state is only a convenience cache.
      }
      return null;
    }
  },
  write(namespace, value, account = TokenManager.getUser()) {
    const key = accountStateKey(namespace, account);
    if (!key) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(namespace, account = TokenManager.getUser()) {
    const key = accountStateKey(namespace, account);
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage failures; account state is only a convenience cache.
    }
  },
  clearLegacy() {
    try {
      LEGACY_UNSCOPED_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Local persistence is optional and must never block app startup.
    }
  },
};

async function request(url, options = {}) {
  const token = TokenManager.get();
  const headers = {
    'Content-Type': 'application/json',
    'Accept-Language': getRequestLocale(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      TokenManager.clear();
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    const error = new Error(formatErrorMessage(data, response.status));
    error.status = response.status;
    error.detail = data.detail || '';
    error.requestId = data.requestId || response.headers.get('x-request-id') || '';
    error.payload = data;
    throw error;
  }

  return data;
}

async function requestEventStream(url, options = {}, handlers = {}) {
  const token = TokenManager.get();
  const headers = {
    'Content-Type': 'application/json',
    'Accept-Language': getRequestLocale(),
    Accept: 'text/event-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${API_BASE}${url}`, { ...options, headers });

  if (!response.ok) {
    let data = {};
    try {
      data = await response.json();
    } catch {
      // Preserve the HTTP status even when the server response is not JSON.
    }
    if (response.status === 401) {
      TokenManager.clear();
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    const error = new Error(formatErrorMessage(data, response.status));
    error.status = response.status;
    error.detail = data.detail || '';
    error.requestId = data.requestId || response.headers.get('x-request-id') || '';
    throw error;
  }
  if (!response.body) throw new Error('AI stream response is empty');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  let result = null;

  const processEvent = (frame) => {
    const lines = frame.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
    const rawData = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!rawData) return;

    let data;
    try {
      data = JSON.parse(rawData);
    } catch {
      throw new Error('AI stream contains an invalid event');
    }
    if (event === 'delta') {
      handlers.onDelta?.(String(data.content || ''));
    } else if (event === 'done') {
      completed = true;
      result = data;
      handlers.onDone?.(data);
    } else if (event === 'error') {
      throw new Error(data.message || 'AI stream failed');
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = done ? '' : frames.pop();
      frames.forEach(processEvent);
      if (done) break;
    }
    if (buffer.trim()) processEvent(buffer);
  } finally {
    reader.releaseLock();
  }

  if (!completed) throw new Error('AI stream ended before completion');
  return result;
}

function formatErrorMessage(data, status) {
  const title = data.error || `Request failed (HTTP ${status})`;
  const lines = [title];

  if (data.detail && data.detail !== title) {
    lines.push(data.detail);
  }

  const requestId = data.requestId;
  if (requestId) {
    lines.push(`Request ID: ${requestId}`);
  }

  return lines.join('\n');
}

export const AuthAPI = {
  register: (email, password, username) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, username }),
    }),
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

export const ProductAPI = {
  getList: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/products${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/products/${id}`),
  getInsights: (id) => request(`/products/${id}/insights`),
  getCategories: () => request('/categories'),
};

export const CartAPI = {
  get: () => request('/cart'),
  add: (productId, quantity = 1) =>
    request('/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    }),
  update: (itemId, quantity) =>
    request(`/cart/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    }),
  remove: (itemId) => request(`/cart/${itemId}`, { method: 'DELETE' }),
};

export const OrderAPI = {
  create: (items, shippingAddress) =>
    request('/orders', {
      method: 'POST',
      body: JSON.stringify({ items, shippingAddress }),
    }),
  getList: () => request('/orders'),
  getById: (id) => request(`/orders/${id}`),
};

export const AIAPI = {
  synthesize: (productId, sellerConversationId, guardianConversationId) =>
    request('/ai/synthesis', {
      method: 'POST',
      body: JSON.stringify({ productId, sellerConversationId, guardianConversationId }),
    }),
  chatStream: (message, aiType, productId = null, conversationId, clientMessageId, options = {}) =>
    requestEventStream('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        aiType,
        productId,
        conversationId,
        clientMessageId,
        scope: options.scope || null,
        researchTechnique: options.researchTechnique || null,
        researchRunId: options.researchRunId || null,
      }),
      signal: options.signal,
    }, options),
  sellerNudgeStream: (productId, dwellMs, conversationId, options = {}) =>
    requestEventStream('/ai/seller-nudge', {
      method: 'POST',
      body: JSON.stringify({
        productId,
        dwellMs,
        conversationId,
        source: 'product-dwell',
      }),
      signal: options.signal,
    }, options),
  getHistory: (aiType, conversationId) =>
    request(`/ai/history?aiType=${encodeURIComponent(aiType)}&conversationId=${encodeURIComponent(conversationId)}`),
  clearHistory: (aiType, conversationId) =>
    request(`/ai/history?aiType=${encodeURIComponent(aiType)}&conversationId=${encodeURIComponent(conversationId)}`, { method: 'DELETE' }),
};

export const ResearchAPI = {
  clearData: () => request('/research/data', { method: 'DELETE' }),
  recommendations: (profile) =>
    request('/research/recommendations', {
      method: 'POST',
      body: JSON.stringify({ profile }),
    }),
  track: (behaviorType, payload = {}) =>
    request('/research/track', {
      method: 'POST',
      body: JSON.stringify({
        behaviorType,
        ...payload,
      }),
    }),
  getSummary: () => request('/research/summary'),
};

export const AdminAPI = {
  getAiConfig: () => request('/admin/ai-config'),
  updateAiConfig: (config) =>
    request('/admin/ai-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  testAiConfig: (config) =>
    request('/admin/ai-test', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  getStats: () => request('/admin/stats'),
  getOrders: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/admin/orders${query ? `?${query}` : ''}`);
  },
  getOrderDetail: (orderId) => request(`/admin/orders/${orderId}`),
  updateOrderStatus: (orderId, payload) =>
    request(`/admin/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
