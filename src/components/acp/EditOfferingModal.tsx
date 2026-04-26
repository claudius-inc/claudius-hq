"use client";

import { useState, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";

interface Offering {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
}

interface EditOfferingModalProps {
  offering: Offering;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditOfferingModal({
  offering,
  isOpen,
  onClose,
  onSaved,
}: EditOfferingModalProps) {
  const [price, setPrice] = useState(offering.price.toString());
  const [description, setDescription] = useState(offering.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPrice(offering.price.toString());
      setDescription(offering.description || "");
      setError(null);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, offering]);

  if (!isOpen) return null;

  const descLen = description.length;
  const descOverLimit = descLen > 500;

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        throw new Error("Invalid price");
      }
      if (descOverLimit) {
        throw new Error(
          `Description must be ≤500 chars (currently ${descLen}). V2 marketplace will reject.`
        );
      }

      const res = await fetch("/api/acp/offerings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: offering.name,
          price: priceNum,
          description,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center md:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal - Bottom sheet on mobile, centered modal on desktop */}
      <div className="relative bg-white w-full max-w-lg mx-0 md:mx-4 md:rounded-xl rounded-t-2xl shadow-xl 
                      fixed md:relative bottom-0 md:bottom-auto
                      animate-in slide-in-from-bottom md:slide-in-from-bottom-0 md:fade-in duration-200">
        {/* Drag handle for mobile */}
        <div className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3" />
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Edit Offering
            </h2>
            <button
              onClick={onClose}
              className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={offering.name}
                disabled
                className="w-full px-3 py-3 md:py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Name cannot be changed
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (USDC)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full pl-7 pr-3 py-3 md:py-2 border border-gray-200 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <span
                  className={`text-xs font-mono ${
                    descOverLimit
                      ? "text-red-600 font-semibold"
                      : descLen > 450
                      ? "text-amber-600"
                      : "text-gray-400"
                  }`}
                >
                  {descLen} / 500
                </span>
              </div>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`w-full px-3 py-3 md:py-2 border rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 resize-none ${
                  descOverLimit
                    ? "border-red-300 focus:ring-red-500"
                    : "border-gray-200 focus:ring-blue-500"
                }`}
                placeholder="Describe what this offering does..."
              />
              {descOverLimit && (
                <p className="text-xs text-red-600 mt-1">
                  V2 marketplace rejects descriptions over 500 characters.
                </p>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                {error}
              </div>
            )}
          </div>

          {/* Buttons - Stack on mobile, inline on desktop */}
          <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-3 md:py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 text-center"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || descOverLimit}
              className="flex items-center justify-center gap-2 px-4 py-3 md:py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Safe area padding for mobile */}
        <div className="md:hidden h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}
