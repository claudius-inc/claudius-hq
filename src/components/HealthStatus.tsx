interface HealthCheck {
  project_id: number;
  project_name: string;
  url: string;
  status_code: number;
  response_time_ms: number;
  ok: boolean;
}

export function HealthStatus({ checks }: { checks: HealthCheck[] }) {
  if (checks.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-4">
        No deployments to monitor
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {checks.map((check) => (
        <div key={check.project_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
          {/* Status dot */}
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${check.ok ? "bg-emerald-500" : "bg-red-500"} ${check.ok ? "" : "animate-pulse"}`} />

          {/* Project name */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {check.project_name}
            </div>
            <div className="text-xs text-gray-400 truncate">
              {check.url}
            </div>
          </div>

          {/* Status code */}
          <div className={`text-xs font-mono ${check.ok ? "text-emerald-600" : "text-red-500"}`}>
            {check.status_code === 0 ? "TIMEOUT" : check.status_code}
          </div>

          {/* Response time */}
          <div className="text-xs text-gray-400 w-16 text-right">
            {check.response_time_ms}ms
          </div>
        </div>
      ))}
    </div>
  );
}

/** Single-project health indicator for project detail pages */
export function HealthIndicator({
  check,
}: {
  check: HealthCheck | null;
}) {
  if (!check) return null;

  return (
    <div className="card flex items-center gap-2 px-3 py-2">
      <div className={`w-2 h-2 rounded-full ${check.ok ? "bg-emerald-500" : "bg-red-500"}`} />
      <span className={`text-sm ${check.ok ? "text-emerald-600" : "text-red-500"}`}>
        {check.ok ? "Healthy" : "Down"}
      </span>
      <span className="text-xs text-gray-400">{check.response_time_ms}ms</span>
    </div>
  );
}
