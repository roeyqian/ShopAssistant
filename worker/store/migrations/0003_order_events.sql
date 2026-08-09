-- Order lifecycle events for research and admin workflow

ALTER TABLE orders ADD COLUMN cancelled_at TEXT;

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT,
  note TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at ASC);
