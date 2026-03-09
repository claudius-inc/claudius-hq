"use client";

import { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Send, AlertCircle, Calendar } from "lucide-react";

interface AcpNewPostModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (post: { content: string; targetOffering: string; scheduledAt: string | null }) => void;
  offerings?: { value: string; label: string }[];
  isLoading?: boolean;
}

export function AcpNewPostModal({ open, onClose, onSubmit, offerings = [], isLoading }: AcpNewPostModalProps) {
  const [content, setContent] = useState("");
  const [targetOffering, setTargetOffering] = useState("");
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const characterLimit = 280;
  const remainingChars = characterLimit - content.length;

  useEffect(() => {
    if (open) {
      setContent("");
      setTargetOffering(offerings[0]?.value ?? "");
      setScheduleType("now");
      setScheduledAt("");
      setError(null);
    }
  }, [open, offerings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError("Post content is required");
      return;
    }

    if (content.length > characterLimit) {
      setError(`Post exceeds ${characterLimit} character limit`);
      return;
    }

    if (scheduleType === "later" && !scheduledAt) {
      setError("Please select a scheduled time");
      return;
    }

    onSubmit({
      content: content.trim(),
      targetOffering,
      scheduledAt: scheduleType === "later" ? scheduledAt : null,
    });
  };

  // Get min datetime (now + 5 minutes)
  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now.toISOString().slice(0, 16);
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Marketing Post">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Content */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Content</label>
            <span
              className={`text-xs ${
                remainingChars < 0
                  ? "text-red-600"
                  : remainingChars < 50
                    ? "text-orange-600"
                    : "text-gray-400"
              }`}
            >
              {remainingChars}
            </span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your marketing post..."
            rows={4}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400 resize-none"
          />
        </div>

        {/* Target Offering */}
        {offerings.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Target Offering <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Select
              value={targetOffering}
              onChange={setTargetOffering}
              options={[{ value: "", label: "No specific offering" }, ...offerings]}
              placeholder="Select offering"
            />
            <p className="text-xs text-gray-500">Associate this post with an offering for attribution tracking</p>
          </div>
        )}

        {/* Schedule */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Schedule</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScheduleType("now")}
              className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                scheduleType === "now"
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-700 hover:border-gray-400"
              }`}
            >
              Post Now
            </button>
            <button
              type="button"
              onClick={() => setScheduleType("later")}
              className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                scheduleType === "later"
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-700 hover:border-gray-400"
              }`}
            >
              <Calendar className="w-4 h-4" />
              Schedule
            </button>
          </div>
        </div>

        {/* DateTime picker */}
        {scheduleType === "later" && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Scheduled Time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={getMinDateTime()}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400"
            />
          </div>
        )}

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
            <Send className="w-4 h-4" />
            {isLoading
              ? "Posting..."
              : scheduleType === "later"
                ? "Schedule Post"
                : "Post Now"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
