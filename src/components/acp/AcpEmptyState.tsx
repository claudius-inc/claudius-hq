"use client";

import { Inbox, Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface AcpEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  children?: ReactNode;
}

export function AcpEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  children,
}: AcpEmptyStateProps) {
  const ActionIcon = action?.icon ?? Plus;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-gray-400" />
      </div>

      <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>

      {description && (
        <p className="text-sm text-gray-500 text-center max-w-sm mb-4">{description}</p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <ActionIcon className="w-4 h-4" />
          {action.label}
        </button>
      )}

      {children}
    </div>
  );
}
