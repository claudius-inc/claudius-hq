import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MarketSignalsCard } from "@/app/markets/scanner/_components/MarketSignalsCard";
import type { MarketSignals } from "@/lib/scanner/signals/types";

describe("MarketSignalsCard", () => {
  it("renders the cluster-buy badge when US signals include isClusterBuy: true", () => {
    const signals: MarketSignals = {
      fetchedAt: "2026-05-01T00:00:00Z",
      us: {
        insiderBuyCount: 5,
        insiderSellCount: 2,
        isClusterBuy: true,
        totalBuyValue: 1_500_000,
        totalSellValue: 250_000,
        lastTransactionDate: "2026-04-22",
      },
    };

    render(<MarketSignalsCard market="US" signals={signals} />);

    expect(screen.getByText(/Cluster Buy/i)).toBeInTheDocument();
    expect(screen.getByText(/buys/i)).toBeInTheDocument();
    expect(screen.getByText(/Last: 2026-04-22/i)).toBeInTheDocument();
  });

  it("renders nothing when signals is null", () => {
    const { container } = render(
      <MarketSignalsCard market="US" signals={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when signals is undefined", () => {
    const { container } = render(
      <MarketSignalsCard market="US" signals={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when market is LSE and no LSE sub-object exists", () => {
    const signals: MarketSignals = {
      fetchedAt: "2026-05-01T00:00:00Z",
      us: {
        insiderBuyCount: 1,
        insiderSellCount: 0,
        isClusterBuy: false,
        totalBuyValue: 100,
        totalSellValue: 0,
      },
    };
    const { container } = render(
      <MarketSignalsCard market="LSE" signals={signals} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders SGX GLC pill with parent appended when present", () => {
    const signals: MarketSignals = {
      fetchedAt: "2026-05-01T00:00:00Z",
      sg: {
        isGLC: true,
        isSChip: false,
        glcParent: "Temasek",
      },
    };
    render(<MarketSignalsCard market="SGX" signals={signals} />);
    expect(screen.getByText(/GLC · Temasek/)).toBeInTheDocument();
  });

  it("renders nothing for SGX when both isGLC and isSChip are false", () => {
    const signals: MarketSignals = {
      fetchedAt: "2026-05-01T00:00:00Z",
      sg: {
        isGLC: false,
        isSChip: false,
      },
    };
    const { container } = render(
      <MarketSignalsCard market="SGX" signals={signals} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
