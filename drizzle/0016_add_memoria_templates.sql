CREATE TABLE memoria_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT,
  structure TEXT NOT NULL,
  is_repeatable INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE memoria_entries ADD COLUMN template_id INTEGER;
ALTER TABLE memoria_entries ADD COLUMN structured_data TEXT;

-- Seed default templates
INSERT INTO memoria_templates (name, source_type, structure, is_repeatable, is_active)
VALUES (
  'Book Summary',
  'book',
  '{"sections":[{"key":"summary","label":"Summary (one paragraph)","type":"textarea"},{"key":"key_events","label":"Key Events","type":"textarea"},{"key":"significant","label":"Significant","type":"textarea"}]}',
  0,
  1
);

INSERT INTO memoria_templates (name, source_type, structure, is_repeatable, is_active)
VALUES (
  'Book Summary (by Chapter)',
  'book',
  '{"sections":[{"key":"chapter_title","label":"Chapter Title","type":"text"},{"key":"summary","label":"Summary","type":"textarea"},{"key":"key_events","label":"Key Events","type":"textarea"},{"key":"significant","label":"Significant","type":"textarea"}]}',
  1,
  1
);
