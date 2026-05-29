import { describe, it, expect } from "vitest";
import { insightFilename, insightToMarkdown, type Insight, type EdgeLink } from "../mnemon-vault";

const INSIGHT: Insight = {
  id: "bd7676ae-c37e-4cd7-b944-7d312f1502f8",
  content: "Encrypted backup of mnemon SQLite DB runs daily at 03:15.",
  category: "decision",
  importance: 5,
  effective_importance: 0.9,
  source: "agent",
  tags: ["backup", "ops"],
  entities: ["DB", "memoria-id:42"],
  created_at: "2026-05-18 05:51:25",
  updated_at: "2026-05-18 05:51:25",
};

describe("insightFilename", () => {
  it("prefixes a short id and slugifies the content", () => {
    expect(insightFilename(INSIGHT)).toBe("bd7676ae-encrypted-backup-of-mnemon-sqlite-db-runs-daily-at.md");
  });
});

describe("insightToMarkdown", () => {
  const links: EdgeLink[] = [
    { type: "entity", weight: 1, targetFile: "abc12345-other-note", targetTitle: "Other note" },
  ];
  const md = insightToMarkdown(INSIGHT, links, new Map([[42, "42-the-entry-title"]]));

  it("writes frontmatter with mnemon-id and category", () => {
    expect(md).toMatch(/mnemon-id: bd7676ae-c37e-4cd7-b944-7d312f1502f8/);
    expect(md).toMatch(/category: decision/);
  });
  it("renders the body content", () => {
    expect(md).toContain("Encrypted backup of mnemon SQLite DB runs daily");
  });
  it("renders edges as wikilinks grouped under Related", () => {
    expect(md).toMatch(/## Related/);
    expect(md).toContain("[[abc12345-other-note|Other note]]");
  });
  it("links memoria-id entities back to the entries folder", () => {
    expect(md).toContain("[[../../entries/42-the-entry-title|Source entry #42]]");
  });
});
