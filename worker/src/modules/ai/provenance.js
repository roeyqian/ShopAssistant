export const AI_PROVENANCE_SCHEMA_VERSION = 1;

// These are release identifiers rather than model-facing instructions. They
// make a saved response comparable even when the configured provider/model is
// changed later.
export const PROMPT_VERSIONS = {
  seller: 'seller-1.5.0',
  guardian: 'guardian-1.5.0',
  neutral: 'neutral-1.5.0',
  structured: 'structured-1.5.0',
  checkout: 'checkout-1.5.0',
  synthesis: 'synthesis-1.5.0',
  research_report: 'research-report-1.5.0',
};

export function buildAiRunMetadata({ config, aiType, systemPrompt, products = [], responseFormat = null }) {
  const catalog = products
    .filter(Boolean)
    .map((product) => ({
      id: String(product.id || ''),
      updatedAt: String(product.updated_at || ''),
      price: product.price ?? null,
      originalPrice: product.original_price ?? null,
      rating: product.rating ?? null,
      stock: product.stock ?? null,
      specs: product.specs || {},
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const promptVersion = PROMPT_VERSIONS[aiType] || PROMPT_VERSIONS.neutral;
  return {
    schemaVersion: AI_PROVENANCE_SCHEMA_VERSION,
    model: String(config?.deepseek_model || 'deepseek-chat'),
    temperature: normalizeTemperature(config?.ai_temperature),
    prompt: {
      version: promptVersion,
      fingerprint: stableFingerprint(systemPrompt),
    },
    catalog: {
      version: `catalog-${catalog.length}-${stableFingerprint(JSON.stringify(catalog))}`,
      fingerprint: stableFingerprint(JSON.stringify(catalog)),
      productCount: catalog.length,
    },
    responseFormat: responseFormat?.type || null,
  };
}

export function normalizeTemperature(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.7;
  return Math.min(2, Math.max(0, Math.round(number * 100) / 100));
}

// A deterministic identifier is sufficient for provenance comparison. It is
// intentionally not described as a cryptographic integrity guarantee.
export function stableFingerprint(value) {
  let hash = 0x811c9dc5;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
