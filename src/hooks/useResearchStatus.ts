import { useState, useEffect, useCallback } from "react";

export interface ResearchStatus {
  lastResearchDate: string;
  reportId: number;
}

export type ResearchStatusMap = Record<string, ResearchStatus | null>;

export function useResearchStatus(tickers: string[]) {
  const [statuses, setStatuses] = useState<ResearchStatusMap>({});
  const [loading, setLoading] = useState(false);

  const fetchStatuses = useCallback(async () => {
    if (tickers.length === 0) {
      setStatuses({});
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/stocks/research-status?tickers=${tickers.join(",")}`
      );
      const data = await res.json();
      if (data.statuses) {
        setStatuses(data.statuses);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  }, [tickers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  return { statuses, loading, refetch: fetchStatuses };
}
