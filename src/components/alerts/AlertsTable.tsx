import { Plus, AlertTriangle } from "lucide-react";
import { StockAlert } from "./types";
import { AlertCard } from "./AlertCard";

interface AlertsTableProps {
  alerts: StockAlert[];
  onAddClick: () => void;
  onEdit: (alert: StockAlert) => void;
  onToggleStatus: (alert: StockAlert) => void;
  onDelete: (id: number) => void;
}

export function AlertsTable({
  alerts,
  onAddClick,
  onEdit,
  onToggleStatus,
  onDelete,
}: AlertsTableProps) {
  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No price alerts configured yet.</p>
          <button
            onClick={onAddClick}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            Create Your First Alert
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Ticker</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Current Price
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">
                Accumulate Zone
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">
                Strong Buy Zone
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">
                Status
              </th>
              <th className="px-4 py-3 font-medium text-gray-600">
                Last Triggered
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onEdit={onEdit}
                onToggleStatus={onToggleStatus}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
