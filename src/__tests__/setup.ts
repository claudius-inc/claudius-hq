import "@testing-library/jest-dom";
import { vi, beforeEach } from "vitest";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

// Mock fetch for API tests
global.fetch = vi.fn() as unknown as typeof fetch;

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
