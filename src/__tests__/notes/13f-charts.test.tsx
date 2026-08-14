import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FlowChart,
  ConvictionChart,
  BookChangeChart,
  ConcentrationChart,
  SectorChart,
} from "@/app/markets/notes/13f/[period]/_components/charts";
import { getPeriod } from "@/lib/notes/thirteenf/periods";

const f = getPeriod("2026-03-31")!;

/** Every x/y/width in the emitted SVG must be a real number. */
function assertFiniteGeometry(svg: string, label: string) {
  // Leading \s is load-bearing: without it the `r=` of `text-anchor="end"` matches.
  const bad = svg.match(/\s(?:x|y|x1|x2|y1|y2|cx|cy|width|height|r)="(?!\d|-\d|\.\d)[^"]*"/g);
  expect(bad, `${label} emitted non-numeric geometry: ${bad?.join(", ")}`).toBeNull();
  expect(svg).not.toContain("NaN");
  expect(svg).not.toContain("Infinity");
  expect(svg).not.toContain("undefined");
}

describe("13F note charts", () => {
  it("flow chart prints every name, its net, and its breadth", () => {
    const svg = renderToStaticMarkup(<FlowChart bought={f.topBought!.value} sold={f.topSold!.value} />);
    assertFiniteGeometry(svg, "FlowChart");
    for (const r of [...f.topBought!.value, ...f.topSold!.value]) expect(svg).toContain(r.ticker);
    expect(svg).toContain("+$10.19B");
    expect(svg).toContain("−$9.48B");
    // The whale correction must survive onto the mark, not just the aria-label.
    expect(svg).toContain("Berkshire Hathaway is all of it");
    expect(svg).toContain("12 bought");
  });

  it("flow chart gives every row its own line, whatever the list length", () => {
    // The split between the bought block and the sold block was once the
    // literal 5. At ten a side that stacked the eleventh row onto the first,
    // and every assertion above still passed because the text was all present.
    const bought = f.topBought!.value;
    const sold = f.topSold!.value;
    expect(bought.length).toBe(10);
    expect(sold.length).toBe(10);

    const svg = renderToStaticMarkup(<FlowChart bought={bought} sold={sold} />);
    const barYs = [...svg.matchAll(/<rect[^>]*\sy="([\d.]+)"[^>]*height="12"/g)].map((m) => Number(m[1]));
    expect(barYs).toHaveLength(bought.length + sold.length);
    expect(new Set(barYs).size).toBe(barYs.length);

    // The canvas has to grow with the list, not clip it.
    const vb = svg.match(/viewBox="0 0 620 ([\d.]+)"/);
    expect(vb).not.toBeNull();
    expect(Number(vb![1])).toBeGreaterThan(Math.max(...barYs));
  });

  it("conviction chart shows both ends of every move", () => {
    const svg = renderToStaticMarkup(<ConvictionChart moves={f.conviction!.value} />);
    assertFiniteGeometry(svg, "ConvictionChart");
    expect(svg).toContain("Pershing Square · MSFT");
    expect(svg).toContain("15.3%");
    expect(svg).toContain("0.7%");
  });

  it("book change chart draws gains inset and losses as a further step", () => {
    const svg = renderToStaticMarkup(<BookChangeChart changes={f.bookChanges!.value} />);
    assertFiniteGeometry(svg, "BookChangeChart");
    expect(svg).toContain("−$11.06B");
    // Elliott's book GREW; the chart must be able to cross the origin.
    expect(svg).toContain("+$1.36B");
    expect(svg).toContain("value gained");
  });

  it("concentration chart ranks all managers and marks the gap", () => {
    const svg = renderToStaticMarkup(<ConcentrationChart rows={f.concentration!.value} />);
    assertFiniteGeometry(svg, "ConcentrationChart");
    expect(svg).toContain("nobody lands in here");
    expect(svg).toContain("Icahn");
    expect(svg).toContain("Citadel");
    expect(svg).toContain(">177<");
  });

  it("sector chart mirrors labels either side of the origin", () => {
    const svg = renderToStaticMarkup(<SectorChart shifts={f.sectors!.value} />);
    assertFiniteGeometry(svg, "SectorChart");
    expect(svg).toContain("Industrials");
    expect(svg).toContain("+1.45");
    expect(svg).toContain("−1.75");
  });
});
