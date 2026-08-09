-- Bind each product consultation to a stable conversation ID so it can be resumed across browser sessions.
UPDATE ai_conversations
SET conversation_id = 'product-' || ai_type || '-' || product_id
WHERE product_id IS NOT NULL
  AND product_id <> ''
  AND ai_type IN ('seller', 'guardian');
