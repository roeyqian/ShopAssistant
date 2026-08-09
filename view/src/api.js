const API_BASE = '/api';
const LOCALE_STORAGE_KEY = 'shopassistant_locale';

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
    if (response.status === 401) TokenManager.clear();
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
      body: JSON.stringify({ message, aiType, productId, conversationId, clientMessageId }),
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
