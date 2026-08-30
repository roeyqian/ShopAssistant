-- Versioned model parameters are saved with every AI response in metadata_json.
-- The table-level value is the active default for newly created runs only.
ALTER TABLE ai_config ADD COLUMN ai_temperature REAL NOT NULL DEFAULT 0.7
  CHECK (ai_temperature >= 0 AND ai_temperature <= 2);
