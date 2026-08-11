export function getProductCatalogPrompt(products = [], locale = 'zh-CN') {
  if (!products.length) {
    return locale === 'en-US'
      ? 'The product database is currently empty. Do not invent products or product facts.'
      : '当前商品数据库为空。不要编造商品或商品事实。';
  }

  const lines = products.map((product) => {
    const details = [
      `[${product.id}] ${product.name}`,
      product.category_id ? `category=${product.category_id}` : '',
      product.subtitle ? `subtitle=${product.subtitle}` : '',
      product.description ? `description=${product.description}` : '',
      `price=¥${product.price}`,
      `original price=¥${product.original_price || product.price}`,
      `stock=${product.stock}`,
      `sales=${product.sales_count}`,
      `rating=${product.rating}/5`,
    ].filter(Boolean);
    return `- ${details.join('; ')}`;
  });

  if (locale === 'en-US') {
    return [
      'Complete product database (all products currently available in the store):',
      ...lines,
      'You can discuss, compare, and switch among any products in this catalog during the same conversation. Use only the facts listed here; an item selected in the interface is only the current focus, not the only item you can see.',
    ].join('\n');
  }

  return [
    '完整商品数据库（当前店内全部商品）：',
    ...lines,
    '同一轮对话中可以讨论、比较并切换目录里的任意商品。只能使用这里列出的事实；界面选中的商品只是当前焦点，不是你唯一能看到的商品。',
  ].join('\n');
}

export function getCurrentProductPrompt(productInfo, locale = 'zh-CN') {
  if (!productInfo) return '';

  if (locale === 'en-US') {
    return [
      `Current focus item (the user may switch at any time): [${productInfo.id}] ${productInfo.name}`,
      `subtitle=${productInfo.subtitle || 'not provided'}; description=${productInfo.description || 'not provided'}`,
      `price=¥${productInfo.price}; original price=¥${productInfo.original_price || productInfo.price}; stock=${productInfo.stock}; sales=${productInfo.sales_count}; rating=${productInfo.rating}/5`,
      'Give priority to this item when the user is asking about the current selection, but continue to consider the complete catalog above when the user asks for alternatives or comparisons.',
    ].join('\n');
  }

  return [
    `当前焦点商品（用户可以随时切换）：[${productInfo.id}] ${productInfo.name}`,
    `副标题：${productInfo.subtitle || '当前样本未提供'}；描述：${productInfo.description || '当前样本未提供'}`,
    `价格：¥${productInfo.price}；原价：¥${productInfo.original_price || productInfo.price}；库存：${productInfo.stock}；销量：${productInfo.sales_count}；评分：${productInfo.rating}/5`,
    '用户询问当前选中商品时优先回应它；用户要求替代或比较时，继续从上面的完整目录中选择，不要把当前焦点当成唯一商品。',
  ].join('\n');
}
