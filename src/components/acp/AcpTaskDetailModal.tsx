"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { AcpPillarBadge } from "./AcpPillarBadge";
import {
  Circle,
  Play,
  CheckCircle,
  RotateCcw,
  Trash2,
  Clock,
  Calendar,
  Timer,
  AlertCircle,
} from "lucide-react";
import type { AcpTask } from "@/db/schema";

interface AcpTaskDetailModalProps {
  task: AcpTask | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (taskId: number, status: string, result?: string) => Promise<void>;
  onDelete: (taskId: number) => Promise<void>;
}

function getPriorityLabel(priority: number): { label: string; color: string } {
  if (priority >= 80) return { label: "High", color: "text-red-600" };
  if (priority >= 50) return { label: "Medium", color: "text-orange-600" };
  return { label: "Low", color: "text-gray-600" };
}

function getStatusConfig(status: string): { color: string; bgColor: string; label: string } {
  switch (status) {
    case "pending":
      return { color: "text-yellow-600", bgColor: "bg-yellow-100", label: "Pending" };
    case "in_progress":
      return { color: "text-blue-600", bgColor: "bg-blue-100", label: "In Progress" };
    case "done":
      return { color: "text-green-600", bgColor: "bg-green-100", label: "Done" };
    case "failed":
      return { color: "text-red-600", bgColor: "bg-red-100", label: "Failed" };
    case "skipped":
      return { color: "text-gray-600", bgColor: "bg-gray-100", label: "Skipped" };
    default:
      return { color: "text-gray-600", bgColor: "bg-gray-100", label: status };
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function AcpTaskDetailModal({
  task,
  isOpen,
  onClose,
  onStatusChange,
  onDelete,
}: AcpTaskDetailModalProps) {
  const [showResultInput, setShowResultInput] = useState(false);
  const [resultText, setResultText] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!task) return null;

  const status = task.status ?? "pending";
  const priority = task.priority ?? 50;
  const priorityInfo = getPriorityLabel(priority);
  const statusConfig = getStatusConfig(status);

  const handleStatusChange = async (newStatus: string, result?: string) => {
    setLoading(true);
    try {
      await onStatusChange(task.id, newStatus, result);
      setShowResultInput(false);
      setResultText("");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    if (showResultInput) {
      handleStatusChange("done", resultText || undefined);
    } else {
      setShowResultInput(true);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setLoading(true);
    try {
      await onDelete(task.id);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setShowResultInput(false);
    setResultText("");
    setConfirmDelete(false);
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title={task.title}>
      <div className="space-y-4">
        {/* Pillar and Priority Row */}
        <div className="flex items-center justify-between gap-3">
          <AcpPillarBadge pillar={task.pillar} size="md" />
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${priorityInfo.color}`}>
              {priority}
            </span>
            <span className="text-xs text-gray-500">
              ({priorityInfo.label} Priority)
            </span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <Circle className={`w-3 h-3 fill-current ${statusConfig.color}`} />
          <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>

        {/* Description */}
        {task.description && (
          <div className="border-t border-gray-100 pt-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Description
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {task.description}
            </div>
          </div>
        )}

        {/* Result (if done) */}
        {status === "done" && task.result && (
          <div className="border-t border-gray-100 pt-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              Result
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap bg-green-50 rounded-lg p-3">
              {task.result}
            </div>
          </div>
        )}

        {/* Error (if failed) */}
        {status === "failed" && task.result && (
          <div className="border-t border-gray-100 pt-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-red-500" />
              Error
            </div>
            <div className="text-sm text-red-700 whitespace-pre-wrap bg-red-50 rounded-lg p-3">
              {task.result}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="border-t border-gray-100 pt-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Timeline
          </div>
          <div className="space-y-1.5">
            {task.createdAt && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-500">Created:</span>
                <span>{formatDate(task.createdAt)}</span>
              </div>
            )}
            {task.assignedAt && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-gray-500">Started:</span>
                <span>{formatDate(task.assignedAt)}</span>
              </div>
            )}
            {task.completedAt && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                <span className="text-gray-500">Completed:</span>
                <span>{formatDate(task.completedAt)}</span>
              </div>
            )}
            {task.assignedAt && task.completedAt && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Timer className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-gray-500">Duration:</span>
                <span className="font-medium text-purple-600">
                  {formatDuration(task.assignedAt, task.completedAt)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Result Input (for Complete action) */}
        {showResultInput && (
          <div className="border-t border-gray-100 pt-3">
            <label className="text-xs text-gray-500 block mb-1">
              What was accomplished? (optional)
            </label>
            <textarea
              value={resultText}
              onChange={(e) => setResultText(e.target.value)}
              placeholder="Describe the result..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-gray-100 pt-3">
          <div className="flex flex-wrap gap-2">
            {/* Status-based actions */}
            {status === "pending" && (
              <button
                onClick={() => handleStatusChange("in_progress")}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                Start
              </button>
            )}

            {status === "in_progress" && (
              <button
                onClick={handleComplete}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {showResultInput ? "Save & Complete" : "Complete"}
              </button>
            )}

            {(status === "done" || status === "failed" || status === "skipped") && (
              <button
                onClick={() => handleStatusChange("pending")}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reopen
              </button>
            )}

            {showResultInput && (
              <button
                onClick={() => {
                  setShowResultInput(false);
                  setResultText("");
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            )}

            {/* Delete button */}
            {!showResultInput && (
              <button
                onClick={handleDelete}
                disabled={loading}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg ml-auto ${
                  confirmDelete
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "text-red-600 border border-red-200 hover:bg-red-50"
                } disabled:opacity-50`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmDelete ? "Confirm Delete" : "Delete"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
