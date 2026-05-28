import { describe, it, expect } from "vitest";
import { parseEntryFile, serializeEntryFile, rowDirty, type EntryRow } from "../vault";

const SAMPLE = `---
memoria-id: 42
source_type: book
title: "Antifragile"
author: Nassim Taleb
favorite: true
created: 2026-03-12
updated: 2026-03-12
tags: [risk, philosophy]
---

Things that gain from disorder.

## Note

My takeaway here.
`;

describe("parseEntryFile", () => {
  it("maps frontmatter + body to a row", () => {
    const row = parseEntryFile(SAMPLE);
    expect(row.id).toBe(42);
    expect(row.source_type).toBe("book");
    expect(row.source_title).toBe("Antifragile");
    expect(row.source_author).toBe("Nassim Taleb");
    expect(row.is_favorite).toBe(1);
    expect(row.content).toBe("Things that gain from disorder.");
    expect(row.my_note).toBe("My takeaway here.");
    expect(row.tags).toEqual(["risk", "philosophy"]);
  });

  it("returns id=null for a new note with no memoria-id", () => {
    const row = parseEntryFile(`---\nsource_type: thought\n---\n\nA fresh idea.\n`);
    expect(row.id).toBeNull();
    expect(row.content).toBe("A fresh idea.");
    expect(row.my_note).toBeNull();
  });
});

describe("serializeEntryFile", () => {
  it("round-trips a parsed row back to markdown with stamped id", () => {
    const row = parseEntryFile(`---\nsource_type: thought\n---\n\nFresh.\n`);
    const stamped = serializeEntryFile({ ...row, id: 99 });
    expect(stamped).toMatch(/memoria-id: 99/);
    const reparsed = parseEntryFile(stamped);
    expect(reparsed.id).toBe(99);
    expect(reparsed.content).toBe("Fresh.");
  });
});

describe("rowDirty", () => {
  it("is false when file matches db", () => {
    const file = parseEntryFile(SAMPLE);
    const db: EntryRow = { ...file };
    expect(rowDirty(file, db)).toBe(false);
  });
  it("is true when content differs", () => {
    const file = parseEntryFile(SAMPLE);
    const db: EntryRow = { ...file, content: "different" };
    expect(rowDirty(file, db)).toBe(true);
  });
  it("is true when tag sets differ regardless of order", () => {
    const file = parseEntryFile(SAMPLE);
    const db: EntryRow = { ...file, tags: ["philosophy"] };
    expect(rowDirty(file, db)).toBe(true);
  });
});
