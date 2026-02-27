"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";

interface IBKRImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function IBKRImportModal({ onClose, onSuccess }: IBKRImportModalProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ibkr/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setUploadResult({
          success: true,
          message: `Imported ${data.tradesInserted} trades, ${data.incomeInserted} income records. ${data.positionsUpdated} positions updated.`,
        });
        onSuccess();
      } else {
        setUploadResult({
          success: false,
          message: data.error || "Upload failed",
        });
      }
    } catch (err) {
      setUploadResult({
        success: false,
        message: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Import IBKR Statement</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Upload your IBKR Activity Statement (Excel format). Duplicate trades
          are automatically skipped.
        </p>

        <label className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 disabled:opacity-50 mb-4">
          <Upload className="w-4 h-4" />
          {uploading ? "Uploading..." : "Choose File"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>

        {uploadResult && (
          <div
            className={`p-3 rounded-lg text-sm ${
              uploadResult.success
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {uploadResult.message}
          </div>
        )}
      </div>
    </div>
  );
}
