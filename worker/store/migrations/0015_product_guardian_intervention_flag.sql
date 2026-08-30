-- Marks products that should receive a Guardian AI intervention at checkout.
-- 0 = no intervention required; 1 = intervention required.
ALTER TABLE products
  ADD COLUMN guardian_ai_intervention_required INTEGER NOT NULL DEFAULT 0
  CHECK (guardian_ai_intervention_required IN (0, 1));
