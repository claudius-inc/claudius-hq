import matter from "gray-matter";

export interface EntryRow {
  id: number | null;
  content: string;
  source_type: string;
  source_title: string | null;
  source_author: string | null;
  source_url: string | null;
  source_location: string | null;
  my_note: string | null;
  is_favorite: number;
  created_at: string | null;
  updated_at: string | null;
  captured_at: string | null;
  tags: string[];
}

const NOTE_HEADING = /\n##\s+Note\s*\n/;

function splitBody(body: string): { content: string; my_note: string | null } {
  const m = body.match(NOTE_HEADING);
  if (!m || m.index === undefined) {
    return { content: body.trim(), my_note: null };
  }
  return {
    content: body.slice(0, m.index).trim(),
    my_note: body.slice(m.index + m[0].length).trim() || null,
  };
}

export function parseEntryFile(raw: string): EntryRow {
  const { data, content: body } = matter(raw);
  const { content, my_note } = splitBody(body);
  const tags = Array.isArray(data.tags)
    ? data.tags.map((t: unknown) => String(t)).filter(Boolean)
    : [];
  return {
    id: data["memoria-id"] != null ? Number(data["memoria-id"]) : null,
    content,
    source_type: String(data.source_type ?? "thought"),
    source_title: data.title != null ? String(data.title) : null,
    source_author: data.author != null ? String(data.author) : null,
    source_url: data.url != null ? String(data.url) : null,
    source_location: data.location != null ? String(data.location) : null,
    my_note,
    is_favorite: data.favorite ? 1 : 0,
    created_at: data.created != null ? String(data.created) : null,
    updated_at: data.updated != null ? String(data.updated) : null,
    captured_at: data.captured != null ? String(data.captured) : null,
    tags,
  };
}

export function serializeEntryFile(row: EntryRow): string {
  const fm: Record<string, unknown> = {};
  if (row.id != null) fm["memoria-id"] = row.id;
  fm.source_type = row.source_type;
  if (row.source_title) fm.title = row.source_title;
  if (row.source_author) fm.author = row.source_author;
  if (row.source_url) fm.url = row.source_url;
  if (row.source_location) fm.location = row.source_location;
  if (row.is_favorite) fm.favorite = true;
  if (row.captured_at) fm.captured = row.captured_at;
  if (row.created_at) fm.created = row.created_at;
  if (row.updated_at) fm.updated = row.updated_at;
  if (row.tags.length) fm.tags = row.tags;

  let body = row.content.trim() + "\n";
  if (row.my_note) body += `\n## Note\n\n${row.my_note.trim()}\n`;
  return matter.stringify(body, fm);
}

export function rowDirty(file: EntryRow, db: EntryRow): boolean {
  const norm = (s: string | null) => (s ?? "").trim();
  if (norm(file.content) !== norm(db.content)) return true;
  if (norm(file.my_note) !== norm(db.my_note)) return true;
  if (norm(file.source_type) !== norm(db.source_type)) return true;
  if (norm(file.source_title) !== norm(db.source_title)) return true;
  if (norm(file.source_author) !== norm(db.source_author)) return true;
  if (norm(file.source_url) !== norm(db.source_url)) return true;
  if (norm(file.source_location) !== norm(db.source_location)) return true;
  if (file.is_favorite !== db.is_favorite) return true;
  const a = [...file.tags].sort().join("|");
  const b = [...db.tags].sort().join("|");
  if (a !== b) return true;
  return false;
}
