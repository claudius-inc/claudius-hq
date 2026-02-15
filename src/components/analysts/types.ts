export interface AnalystCall {
  id: number;
  analystId: number;
  analystName?: string;
  analystFirm?: string;
  ticker: string;
  action: string;
  priceTarget: number | null;
  priceAtCall: number | null;
  currentPrice: number | null;
  callDate: string;
  notes: string | null;
  outcome: string | null;
  createdAt: string;
}

export interface Analyst {
  id: number;
  name: string;
  firm: string;
  specialty: string | null;
  successRate: number | null;
  avgReturn: number | null;
  notes: string | null;
  createdAt: string;
  callCount: number;
  recentCalls: AnalystCall[];
}
