export function getProductImageUrl(productId) {
  return `/api/products/${encodeURIComponent(productId)}/image`;
}

export function getLocaleFromRequest(request, url) {
  const requested = url?.searchParams?.get('lang') || url?.searchParams?.get('locale');
  const header = request?.headers?.get('accept-language') || '';
  const value = String(requested || header || '').toLowerCase();
  return value.startsWith('en') ? 'en-US' : 'zh-CN';
}

export function normalizeCategory(category, locale = 'zh-CN') {
  if (!category) return category;
  return {
    ...category,
    name: localizeText(category.name, category.name_en, locale),
  };
}

export function normalizeProduct(product, locale = 'zh-CN') {
  const images = parseJson(product.images_json, []);
  return {
    ...product,
    name: localizeText(product.name, product.name_en, locale),
    subtitle: localizeText(product.subtitle, product.subtitle_en, locale),
    description: localizeText(product.description, product.description_en, locale),
    image_url: getProductImageUrl(product.id),
    images,
    specs: parseJson(product.specs_json, {}),
    tags: parseJson(product.tags_json, []),
  };
}

export async function getProductImage({ env, params }) {
  const imageKey = `products/${params.id}.jpeg`;
  const image = await env.zero_1_store.get(imageKey);

  if (!image) {
    throw { status: 404, message: "Product image not found" };
  }

  const headers = new Headers();
  headers.set("content-type", "image/jpeg");
  headers.set("cache-control", "public, max-age=3600");

  return new Response(image.body, {
    headers,
  });
}

function localizeText(defaultText, englishText, locale) {
  if (locale === 'en-US' && englishText) return englishText;
  return defaultText;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
