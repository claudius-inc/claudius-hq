interface GitHubData {
  project_name: string;
  repo: string;
  commits: { sha: string; message: string; author: string; date: string; url: string }[];
  pull_requests: { number: number; title: string; state: string; url: string; author: string }[];
  issues: { number: number; title: string; state: string; url: string; author: string }[];
}

const prStateColors: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700",
  closed: "bg-red-100 text-red-700",
  merged: "bg-purple-100 text-purple-700",
};

const issueStateColors: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-200 text-gray-600",
};

export function GitHubActivity({ data }: { data: GitHubData | null }) {
  if (!data) {
    return (
      <div className="text-sm text-gray-400 text-center py-4">
        No GitHub repo linked
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        <a
          href={`https://github.com/${data.repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-600 hover:text-emerald-700 font-medium"
        >
          {data.repo}
        </a>
      </div>

      {/* Recent Commits */}
      {data.commits.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Recent Commits
          </h4>
          <div className="space-y-1.5">
            {data.commits.slice(0, 5).map((c) => (
              <a
                key={c.sha}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 text-sm hover:bg-gray-50 rounded p-1 -mx-1 transition-colors"
              >
                <code className="text-xs text-emerald-600 font-mono mt-0.5 shrink-0">
                  {c.sha}
                </code>
                <span className="text-gray-700 truncate">{c.message}</span>
                <span className="text-xs text-gray-400 shrink-0 ml-auto">
                  {timeAgo(c.date)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Pull Requests */}
      {data.pull_requests.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Pull Requests
          </h4>
          <div className="space-y-1.5">
            {data.pull_requests.map((pr) => (
              <a
                key={pr.number}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm hover:bg-gray-50 rounded p-1 -mx-1 transition-colors"
              >
                <span className={`status-badge ${prStateColors[pr.state] || "bg-gray-100 text-gray-600"}`}>
                  {pr.state}
                </span>
                <span className="text-gray-700 truncate">
                  #{pr.number} {pr.title}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Issues */}
      {data.issues.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Issues
          </h4>
          <div className="space-y-1.5">
            {data.issues.map((issue) => (
              <a
                key={issue.number}
                href={issue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm hover:bg-gray-50 rounded p-1 -mx-1 transition-colors"
              >
                <span className={`status-badge ${issueStateColors[issue.state] || "bg-gray-100 text-gray-600"}`}>
                  {issue.state}
                </span>
                <span className="text-gray-700 truncate">
                  #{issue.number} {issue.title}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {data.commits.length === 0 &&
        data.pull_requests.length === 0 &&
        data.issues.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-2">
            No recent GitHub activity
          </div>
        )}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
