"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Only allow same-origin relative paths. Rejects protocol-relative (`//evil`),
// absolute URLs, backslash tricks, and malformed encodings — preventing the
// `?from=` param from being weaponized as an open-redirect.
function safeFrom(from: string | null): string {
  if (!from) return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(from);
  } catch {
    return "/";
  }
  if (!decoded.startsWith("/")) return "/";
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return "/";
  return decoded;
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      const fromParam =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("from")
          : null;
      router.push(safeFrom(fromParam));
      router.refresh();
    } else {
      setError("Invalid password");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-emerald-600">Claudius HQ</h1>
            <p className="text-gray-400 text-sm mt-1">Mission Control</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-gray-100 border border-gray-300 rounded-md px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 disabled:opacity-50"
            >
              {loading ? "..." : "Enter"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
