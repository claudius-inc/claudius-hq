"use client";

import { Comment } from "@/lib/types";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  comments: Comment[];
  targetType: "task" | "activity" | "project";
  targetId: number;
}

export function CommentSection({ comments, targetType, targetId }: Props) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true);

    try {
      await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, text: text.trim(), author: "Mr Z" }),
      });
      setText("");
      router.refresh();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="card">
      {/* Comment list */}
      <div className="space-y-3 mb-4">
        {comments.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-4">No comments yet</p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="border-l-2 border-gray-200 pl-3">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-medium text-gray-700">{comment.author}</span>
              <span className="text-[10px] text-gray-400">
                {new Date(comment.created_at + "Z").toLocaleString()}
              </span>
              {!comment.is_read && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              )}
            </div>
            <p className="text-sm text-gray-500">{comment.text}</p>
          </div>
        ))}
      </div>

      {/* Comment form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 bg-gray-100 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 placeholder-zinc-600 focus:outline-none focus:border-gray-400"
        />
        <button
          type="submit"
          disabled={posting || !text.trim()}
          className="btn-primary text-sm px-3 disabled:opacity-50"
        >
          {posting ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
