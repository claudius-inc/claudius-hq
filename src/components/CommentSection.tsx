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
          <p className="text-zinc-600 text-sm text-center py-4">No comments yet</p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="border-l-2 border-zinc-800 pl-3">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-medium text-zinc-300">{comment.author}</span>
              <span className="text-[10px] text-zinc-600">
                {new Date(comment.created_at + "Z").toLocaleString()}
              </span>
              {!comment.is_read && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              )}
            </div>
            <p className="text-sm text-zinc-400">{comment.text}</p>
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
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
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
