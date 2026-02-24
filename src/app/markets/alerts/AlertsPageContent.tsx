"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import {
  AlertsTable,
  AlertForm,
  AlertLegend,
  StockAlert,
} from "@/components/alerts";

export function AlertsPageContent() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState<StockAlert | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this alert?")) return;

    try {
      await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to delete alert:", err);
    }
  };

  const handleToggleStatus = async (alert: StockAlert) => {
    const newStatus = alert.status === "paused" ? "watching" : "paused";

    try {
      await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to toggle status:", err);
    }
  };

  const handleSave = async () => {
    await fetchAlerts();
    setShowAddModal(false);
    setEditingAlert(null);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingAlert(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Price Alerts"
        subtitle="Monitor stocks for accumulation and buying opportunities"
        actions={[
          { label: "Add Alert", onClick: () => setShowAddModal(true), icon: <Plus className="w-4 h-4" />, variant: "primary" },
        ]}
      />

      {/* Alerts Table */}
      <AlertsTable
        alerts={alerts}
        onAddClick={() => setShowAddModal(true)}
        onEdit={setEditingAlert}
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
      />

      {/* Legend */}
      {alerts.length > 0 && <AlertLegend />}

      {/* Add/Edit Modal */}
      {(showAddModal || editingAlert) && (
        <AlertForm
          alert={editingAlert}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
