-- Stop recording generic click events in research behavior logs.

DROP TABLE IF EXISTS user_behaviors_no_click;

CREATE TABLE user_behaviors_no_click (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  behavior_type TEXT NOT NULL CHECK (behavior_type IN ('view_product', 'add_cart', 'remove_cart', 'place_order', 'chat_ai', 'search', 'intervention_check')),
  product_id TEXT,
  duration_ms INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  timestamp TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO user_behaviors_no_click (
  id,
  user_id,
  session_id,
  behavior_type,
  product_id,
  duration_ms,
  metadata_json,
  timestamp
)
SELECT
  id,
  user_id,
  session_id,
  behavior_type,
  product_id,
  duration_ms,
  metadata_json,
  timestamp
FROM user_behaviors
WHERE behavior_type != 'click';

DROP TABLE user_behaviors;

ALTER TABLE user_behaviors_no_click RENAME TO user_behaviors;

CREATE INDEX IF NOT EXISTS idx_behaviors_user_session ON user_behaviors(user_id, session_id, timestamp);
