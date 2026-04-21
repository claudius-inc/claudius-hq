"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

interface EditThemeModalProps {
  open: boolean;
  themeId: number;
  initialName: string;
  initialDescription: string;
  onClose: () => void;
  onSave: (id: number, name: string, description: string) => Promise<void>;
}

export function EditThemeModal({
  open,
  themeId,
  initialName,
  initialDescription,
  onClose,
  onSave,
}: EditThemeModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      setSaving(false);
    }
  }, [open, initialName, initialDescription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(themeId, name.trim(), description.trim());
      onClose();
    } catch {
      // stay open on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Theme" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Quantum Computing"
            className="input w-full"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description"
            className="input w-full h-20 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim()} className="btn-primary">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
