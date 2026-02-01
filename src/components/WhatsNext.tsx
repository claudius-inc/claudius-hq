import { Project, ChecklistProgress } from "@/lib/types";
import Link from "next/link";

interface WhatsNextItem {
  project: Project;
  message: string;
  icon: string;
  urgency: "high" | "medium" | "low";
}

interface WhatsNextProps {
  projects: Project[];
  checklistProgress: Record<number, { total: number; completed: number; nextItem: string | null }>;
  blockedTasks: { project_id: number; blocker_reason: string }[];
}

function getPhaseEmoji(phase: string): string {
  const map: Record<string, string> = {
    idea: "💡",
    research: "🔍",
    build: "🔨",
    launch: "🚀",
    grow: "📈",
    iterate: "🔄",
    maintain: "🛡️",
  };
  return map[phase] || "📋";
}

export function WhatsNext({ projects, checklistProgress, blockedTasks }: WhatsNextProps) {
  const items: WhatsNextItem[] = [];

  for (const project of projects) {
    if (project.status === "done") continue;

    const blockers = blockedTasks.filter((t) => t.project_id === project.id);

    if (project.phase === "launch") {
      const progress = checklistProgress[project.id];
      if (progress) {
        if (progress.nextItem) {
          items.push({
            project,
            message: `Next: ${progress.nextItem}`,
            icon: "🚀",
            urgency: "high",
          });
        } else if (progress.completed === progress.total && progress.total > 0) {
          items.push({
            project,
            message: "Launch complete — ready to move to grow",
            icon: "✅",
            urgency: "low",
          });
        } else {
          items.push({
            project,
            message: "Launch phase — set up checklist items",
            icon: "🚀",
            urgency: "medium",
          });
        }
      } else {
        items.push({
          project,
          message: "Launch phase — no checklist initialized yet",
          icon: "🚀",
          urgency: "medium",
        });
      }
    } else if (project.phase === "build") {
      if (blockers.length > 0) {
        items.push({
          project,
          message: `Blocked — ${blockers[0].blocker_reason || "unknown reason"}`,
          icon: "🚧",
          urgency: "high",
        });
      } else {
        const desc = project.description
          ? project.description.length > 60
            ? project.description.substring(0, 60) + "…"
            : project.description
          : "in progress";
        items.push({
          project,
          message: `Building — ${desc}`,
          icon: "🔨",
          urgency: "medium",
        });
      }
    } else {
      // Other phases: one-liner
      const emoji = getPhaseEmoji(project.phase);
      const phaseLabel = project.phase.charAt(0).toUpperCase() + project.phase.slice(1);
      const desc = project.description
        ? ` — ${project.description.length > 50 ? project.description.substring(0, 50) + "…" : project.description}`
        : "";
      items.push({
        project,
        message: `${phaseLabel} phase${desc}`,
        icon: emoji,
        urgency: "low",
      });
    }
  }

  // Sort: high urgency first, then medium, then low
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">⚡</span>
        <h2 className="text-base font-semibold text-gray-900">What&apos;s Next</h2>
        <span className="text-xs text-gray-400 ml-auto">{items.length} active</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.project.id}
            href={`/projects/${item.project.id}`}
            className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-white/80 transition-colors group"
          >
            <span className="text-base mt-0.5 shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-900 group-hover:text-emerald-700 transition-colors">
                  {item.project.name}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    item.urgency === "high"
                      ? "bg-red-100 text-red-600"
                      : item.urgency === "medium"
                      ? "bg-amber-100 text-amber-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {item.project.phase}
                </span>
              </div>
              <p className="text-sm text-gray-500 truncate">{item.message}</p>
            </div>
            <span className="text-gray-300 group-hover:text-gray-500 transition-colors text-sm mt-1">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
