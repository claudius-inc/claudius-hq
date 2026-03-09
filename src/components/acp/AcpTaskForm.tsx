"use client";

import { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Save, AlertCircle } from "lucide-react";
import type { AcpPillar } from "./AcpPillarBadge";

interface Task {
  id?: number;
  pillar: AcpPillar | string;
  priority: number;
  title: string;
  description: string;
}

interface AcpTaskFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (task: Omit<Task, "id">) => void;
  initialData?: Partial<Task>;
  isLoading?: boolean;
}

const pillarOptions = [
  { value: "quality", label: "Quality" },
  { value: "replace", label: "Replace" },
  { value: "build", label: "Build" },
  { value: "experiment", label: "Experiment" },
];

const priorityOptions = [
  { value: "25", label: "Low (25)" },
  { value: "50", label: "Medium (50)" },
  { value: "75", label: "High (75)" },
  { value: "100", label: "Critical (100)" },
];

export function AcpTaskForm({ open, onClose, onSubmit, initialData, isLoading }: AcpTaskFormProps) {
  const [pillar, setPillar] = useState<string>(initialData?.pillar ?? "quality");
  const [priority, setPriority] = useState<string>(String(initialData?.priority ?? 50));
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const isEdit = initialData?.id !== undefined;

  useEffect(() => {
    if (open) {
      setPillar(initialData?.pillar ?? "quality");
      setPriority(String(initialData?.priority ?? 50));
      setTitle(initialData?.title ?? "");
      setDescription(initialData?.description ?? "");
      setError(null);
    }
  }, [open, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    onSubmit({
      pillar,
      priority: parseInt(priority, 10),
      title: title.trim(),
      description: description.trim(),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Task" : "Add Task"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Pillar */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Pillar</label>
          <Select
            value={pillar}
            onChange={setPillar}
            options={pillarOptions}
            placeholder="Select pillar"
          />
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Priority</label>
          <Select
            value={priority}
            onChange={setPriority}
            options={priorityOptions}
            placeholder="Select priority"
          />
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter task title"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the task..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {isLoading ? "Saving..." : isEdit ? "Update Task" : "Add Task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
