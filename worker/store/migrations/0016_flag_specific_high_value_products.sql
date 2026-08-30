-- These specific high-value products receive a Guardian AI review at checkout.
-- prod_001: iPhone 15 Pro Max (¥8,999)
-- prod_002: MacBook Air M3 (¥7,999)
-- prod_004: iPad Pro (¥6,999)
-- prod_021: Xiaomi 13 Ultra (¥5,999)
UPDATE products
SET guardian_ai_intervention_required = 1
WHERE id IN ('prod_001', 'prod_002', 'prod_004', 'prod_021');
