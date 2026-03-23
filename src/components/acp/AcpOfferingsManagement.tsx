"use client";

import { useState, useCallback } from "react";
import { AcpOfferingsTable } from "./AcpOfferingsTable";
import { WalletBalanceCard } from "./WalletBalanceCard";
import { RecentJobsTable } from "./RecentJobsTable";

interface Offering {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  isActive?: number | null;
  jobCount?: number | null;
  totalRevenue?: number | null;
  lastJobAt?: string | null;
  createdAt?: string | null;
}

interface AcpOfferingsManagementProps {
  initialOfferings: Offering[];
}

export function AcpOfferingsManagement({ initialOfferings }: AcpOfferingsManagementProps) {
  const [offerings, setOfferings] = useState(initialOfferings);
  const [apiKey, setApiKey] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshOfferings = useCallback(async () => {
    try {
      const res = await fetch("/api/acp/offerings", {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      
      if (res.ok) {
        const data = await res.json();
        setOfferings(data.offerings);
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      console.error("Failed to refresh offerings:", err);
    }
  }, [apiKey]);

  return (
    <div className="space-y-6">
      {/* Wallet Balance - loads automatically (server-side auth) */}
      <WalletBalanceCard key={`wallet-${refreshKey}`} />

      {/* Offerings Table - requires API key for toggle/edit operations */}
      <AcpOfferingsTable
        offerings={offerings}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        onRefresh={refreshOfferings}
      />

      {/* Recent Jobs - loads automatically (server-side auth) */}
      <RecentJobsTable limit={15} key={`jobs-${refreshKey}`} />
    </div>
  );
}
