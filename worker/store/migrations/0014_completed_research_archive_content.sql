-- A completed study has two immutable deliverables: its structured report in
-- D1 and the complete raw-material package in the private R2 archive prefix.
ALTER TABLE completed_research_archives ADD COLUMN report_json TEXT;
ALTER TABLE completed_research_archives ADD COLUMN report_generated_at TEXT;
ALTER TABLE completed_research_archives ADD COLUMN report_model TEXT;
ALTER TABLE completed_research_archives ADD COLUMN r2_archive_key TEXT;
ALTER TABLE completed_research_archives ADD COLUMN r2_archive_url TEXT;
ALTER TABLE completed_research_archives ADD COLUMN r2_archived_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_completed_research_archives_r2_key
  ON completed_research_archives(r2_archive_key)
  WHERE r2_archive_key IS NOT NULL;
