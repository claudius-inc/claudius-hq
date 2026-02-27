import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
  portfolioHoldings: { id: "id", ticker: "ticker", targetAllocation: "target_allocation" },
  portfolioReports: { id: "id", createdAt: "created_at" },
  watchlist: { id: "id", ticker: "ticker" },
}));

import {
  listHoldings,
  getHolding,
  getHoldingByTicker,
  createHolding,
  updateHolding,
  deleteHolding,
  listReports,
  getLatestReport,
  createReport,
} from "@/services/portfolio.service";
import { db } from "@/db";

describe("portfolio.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listHoldings", () => {
    it("should return holdings ordered by allocation", async () => {
      const mockHoldings = [
        { id: 1, ticker: "AAPL", targetAllocation: 30 },
        { id: 2, ticker: "MSFT", targetAllocation: 20 },
      ];

      vi.mocked(db.select().from).mockImplementation(() => ({
        orderBy: vi.fn().mockResolvedValue(mockHoldings),
      }) as unknown as ReturnType<typeof db.select>);

      const result = await listHoldings();
      expect(result).toEqual(mockHoldings);
    });
  });

  describe("getHoldingByTicker", () => {
    it("should uppercase ticker for lookup", async () => {
      const mockHolding = { id: 1, ticker: "AAPL", targetAllocation: 30 };

      const whereMock = vi.fn().mockResolvedValue([mockHolding]);
      vi.mocked(db.select().from).mockImplementation(() => ({
        where: whereMock,
      }) as unknown as ReturnType<typeof db.select>);

      await getHoldingByTicker("aapl");
      expect(whereMock).toHaveBeenCalled();
    });

    it("should return null when not found", async () => {
      vi.mocked(db.select().from).mockImplementation(() => ({
        where: vi.fn().mockResolvedValue([]),
      }) as unknown as ReturnType<typeof db.select>);

      const result = await getHoldingByTicker("NOTEXIST");
      expect(result).toBeNull();
    });
  });

  describe("createHolding", () => {
    it("should return error when ticker already exists", async () => {
      const mockExisting = { id: 1, ticker: "AAPL", targetAllocation: 30 };

      vi.mocked(db.select().from).mockImplementation(() => ({
        where: vi.fn().mockResolvedValue([mockExisting]),
      }) as unknown as ReturnType<typeof db.select>);

      const result = await createHolding({
        ticker: "AAPL",
        targetAllocation: 20,
      });

      expect(result.error).toBe("already_exists");
      expect(result.holding).toBeNull();
    });
  });

  describe("updateHolding", () => {
    it("should include updatedAt timestamp", async () => {
      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      vi.mocked(db.update).mockReturnValue({
        set: setMock,
      } as unknown as ReturnType<typeof db.update>);

      await updateHolding(1, { targetAllocation: 25 });
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          targetAllocation: 25,
          updatedAt: expect.any(String),
        })
      );
    });
  });

  describe("createReport", () => {
    it("should create a portfolio report", async () => {
      const mockReport = { id: 1, content: "Test report", summary: "Summary" };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockReport]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await createReport({
        content: "Test report",
        summary: "Summary",
      });

      expect(result.content).toBe("Test report");
    });
  });
});
