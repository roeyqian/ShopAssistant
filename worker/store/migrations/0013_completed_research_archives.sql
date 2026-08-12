-- Completed studies are preserved as immutable per-run snapshots.
CREATE TABLE IF NOT EXISTS completed_research_archives (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  research_run_id TEXT NOT NULL,
  final_decision TEXT NOT NULL CHECK (final_decision IN ('buy', 'observe', 'not_buy')),
  selected_product_id TEXT,
  profile_json TEXT NOT NULL DEFAULT '{}',
  snapshot_json TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, research_run_id)
);

CREATE INDEX IF NOT EXISTS idx_completed_research_archives_user_completed
  ON completed_research_archives(user_id, completed_at DESC);
