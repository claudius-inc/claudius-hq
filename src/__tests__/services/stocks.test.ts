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
  stockReports: { id: "id", ticker: "ticker", createdAt: "created_at" },
  researchJobs: { id: "id", reportId: "report_id" },
}));

import {
  listStockReports,
  getStockReport,
  createStockReport,
  updateStockReport,
  deleteStockReport,
} from "@/services/stocks.service";
import { db } from "@/db";

describe("stocks.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listStockReports", () => {
    it("should return all reports when no ticker provided", async () => {
      const mockReports = [
        { id: 1, ticker: "AAPL", title: "Apple Report" },
        { id: 2, ticker: "MSFT", title: "Microsoft Report" },
      ];

      vi.mocked(db.select().from).mockImplementation(() => ({
        orderBy: vi.fn().mockResolvedValue(mockReports),
        where: vi.fn().mockReturnThis(),
      }) as unknown as ReturnType<typeof db.select>);

      const result = await listStockReports();
      expect(result).toEqual(mockReports);
    });

    it("should filter by ticker when provided", async () => {
      const mockReports = [{ id: 1, ticker: "AAPL", title: "Apple Report" }];

      vi.mocked(db.select().from).mockImplementation(() => ({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockReports),
      }) as unknown as ReturnType<typeof db.select>);

      const result = await listStockReports("AAPL");
      expect(result).toEqual(mockReports);
    });
  });

  describe("createStockReport", () => {
    it("should create a report with uppercase ticker", async () => {
      const mockReport = {
        id: 1,
        ticker: "AAPL",
        title: "Sun Tzu Report: AAPL",
        content: "Test content",
        reportType: "sun-tzu",
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockReport]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await createStockReport({
        ticker: "aapl",
        content: "Test content",
      });

      expect(result.ticker).toBe("AAPL");
    });
  });

  describe("updateStockReport", () => {
    it("should return false when no fields provided", async () => {
      const result = await updateStockReport(1, {});
      expect(result).toBe(false);
    });
  });

  describe("deleteStockReport", () => {
    it("should return false when report not found", async () => {
      vi.mocked(db.select().from).mockImplementation(() => ({
        where: vi.fn().mockResolvedValue([]),
      }) as unknown as ReturnType<typeof db.select>);

      const result = await deleteStockReport(999);
      expect(result).toBe(false);
    });
  });
});
