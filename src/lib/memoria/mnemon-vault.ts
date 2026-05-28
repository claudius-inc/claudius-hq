export interface Insight {
  id: string;
  content: string;
  category: string;
  importance: number;
  effective_importance: number;
  source: string;
  tags: string[];
  entities: string[];
  created_at: string;
  updated_at: string;
}

export interface EdgeLink {
  type: "temporal" | "semantic" | "causal" | "entity";
  weight: number;
  targetFile: string;
  targetTitle: string;
}

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function insightTitle(i: Insight): string {
  return i.content.trim().split(/\s+/).slice(0, 10).join(" ");
}

export function insightFilename(i: Insight): string {
  const shortId = i.id.slice(0, 8);
  return `${shortId}-${slugify(insightTitle(i))}.md`;
}

function yamlList(items: string[]): string {
  return `[${items.map((t) => (/[:#\[\]{},]/.test(t) ? `"${t.replace(/"/g, '\\"')}"` : t)).join(", ")}]`;
}

function dateOnly(s: string): string {
  const m = String(s || "").match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

export function insightToMarkdown(
  i: Insight,
  links: EdgeLink[],
  entryTitlesById: Map<number, string>
): string {
  const fm: string[] = [];
  fm.push(`mnemon-id: ${i.id}`);
  fm.push(`category: ${i.category}`);
  fm.push(`importance: ${i.importance}`);
  fm.push(`effective_importance: ${i.effective_importance}`);
  fm.push(`source: ${i.source}`);
  if (i.tags.length) fm.push(`tags: ${yamlList(i.tags)}`);
  if (i.entities.length) fm.push(`entities: ${yamlList(i.entities)}`);
  if (dateOnly(i.created_at)) fm.push(`created: ${dateOnly(i.created_at)}`);
  if (dateOnly(i.updated_at)) fm.push(`updated: ${dateOnly(i.updated_at)}`);

  let body = `---\n${fm.join("\n")}\n---\n\n${i.content.trim()}\n`;

  const entryLinks: string[] = [];
  for (const e of i.entities) {
    const m = e.match(/^memoria-id:(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      const title = entryTitlesById.get(id);
      if (title) entryLinks.push(`- [[../Entries/${title}|Source entry #${id}]]`);
    }
  }
  if (entryLinks.length) {
    body += `\n## Source\n\n${entryLinks.join("\n")}\n`;
  }

  if (links.length) {
    body += `\n## Related\n\n`;
    const byType: Record<string, EdgeLink[]> = {};
    for (const l of links) (byType[l.type] ||= []).push(l);
    for (const type of Object.keys(byType).sort()) {
      body += `**${type}**\n`;
      for (const l of byType[type].sort((a, b) => b.weight - a.weight)) {
        body += `- [[${l.targetFile}|${l.targetTitle}]]\n`;
      }
      body += `\n`;
    }
  }
  return body;
}
