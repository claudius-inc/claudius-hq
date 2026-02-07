"use client";

interface ActionPlanCardProps {
  phase: string;
  actionPlan: string;
  researchCount: number;
  projectId: number;
  deployUrl?: string;
}

const phases = [
  { key: "research", label: "Research" },
  { key: "build", label: "Build" },
  { key: "live", label: "Deployed" },
];

// Infer phase from multiple signals
function inferPhase(phase: string, researchCount: number, deployUrl?: string): string {
  // If explicitly set to live, or has deploy_url with 'vercel' (production deploy)
  if (phase === "live" || (deployUrl && deployUrl.includes("vercel"))) {
    return "live";
  }
  
  // If lots of research and action plan mentions "research phase", it's research
  // For simplicity: if no production deploy and > 5 research pages, likely still research
  if (!deployUrl && researchCount > 5) {
    return "research";
  }
  
  // Default to build
  return "build";
}

export function ActionPlanCard({ phase, actionPlan, researchCount, projectId, deployUrl }: ActionPlanCardProps) {
  const inferredPhase = inferPhase(phase, researchCount, deployUrl);
  const currentIndex = phases.findIndex((p) => p.key === inferredPhase);

  // Parse action plan into sections
  const sections = parseActionPlan(actionPlan);

  return (
    <div className="card mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <span>📋</span> Action Plan
        </h2>
        {researchCount > 0 && (
          <a
            href={`/projects/${projectId}/research`}
            className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            🔬 {researchCount} Research Pages →
          </a>
        )}
      </div>

      {/* Progress Stepper */}
      <div className="mb-6 pb-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          {phases.map((p, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <div key={p.key} className="flex items-center flex-1 last:flex-none">
                {/* Step */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-lg transition-all ${
                      isCompleted
                        ? "bg-emerald-500 text-white"
                        : isCurrent
                        ? "bg-emerald-500 text-white ring-4 ring-emerald-100"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isCompleted ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <span className="text-sm font-semibold">{index + 1}</span>
                    )}
                  </div>
                  <span
                    className={`mt-2 text-sm font-medium ${
                      isCurrent
                        ? "text-emerald-600"
                        : isCompleted
                        ? "text-gray-700"
                        : "text-gray-400"
                    }`}
                  >
                    {p.label}
                  </span>
                </div>

                {/* Connector */}
                {index < phases.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-3 rounded-full ${
                      index < currentIndex ? "bg-emerald-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Plan Content */}
      <div className="space-y-4">
        {sections.map((section, i) => (
          <div key={i} className={section.type === "header" ? "pt-2" : ""}>
            {section.type === "header" ? (
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                {section.icon && <span>{section.icon}</span>}
                {section.content}
              </h3>
            ) : section.type === "list" ? (
              <ul className="space-y-2 ml-1">
                {section.items?.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : section.type === "numbered" ? (
              <ol className="space-y-2 ml-1">
                {section.items?.map((item, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-5 h-5 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-xs font-medium">
                      {j + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            ) : section.type === "link" ? (
              <a
                href={section.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
              >
                🔗 {section.content}
              </a>
            ) : (
              <p className="text-sm text-gray-700">{section.content}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Section {
  type: "header" | "list" | "numbered" | "text" | "link";
  content?: string;
  items?: string[];
  icon?: string;
  url?: string;
}

function parseActionPlan(text: string): Section[] {
  if (!text) return [];

  const sections: Section[] = [];
  const lines = text.split("\n");
  let currentList: string[] = [];
  let currentListType: "list" | "numbered" | null = null;

  const flushList = () => {
    if (currentList.length > 0 && currentListType) {
      sections.push({ type: currentListType, items: currentList });
      currentList = [];
      currentListType = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    // Check for headers (ALL CAPS with colon, or starting with ##)
    if (/^[A-Z][A-Z\s\-()]+:/.test(trimmed) || trimmed.startsWith("##")) {
      flushList();
      const headerText = trimmed.replace(/^#+\s*/, "").replace(/:$/, "");
      const icon = getHeaderIcon(headerText);
      sections.push({ type: "header", content: headerText, icon });
    }
    // Check for numbered list items
    else if (/^\d+[\.\)]\s/.test(trimmed)) {
      if (currentListType !== "numbered") {
        flushList();
        currentListType = "numbered";
      }
      currentList.push(trimmed.replace(/^\d+[\.\)]\s*/, ""));
    }
    // Check for bullet list items
    else if (/^[-•*]\s/.test(trimmed)) {
      if (currentListType !== "list") {
        flushList();
        currentListType = "list";
      }
      currentList.push(trimmed.replace(/^[-•*]\s*/, ""));
    }
    // Check for URLs
    else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      flushList();
      sections.push({ type: "link", content: trimmed, url: trimmed });
    }
    // Regular text
    else {
      flushList();
      sections.push({ type: "text", content: trimmed });
    }
  }

  flushList();
  return sections;
}

function getHeaderIcon(header: string): string {
  const h = header.toLowerCase();
  if (h.includes("current") || h.includes("status")) return "📍";
  if (h.includes("immediate") || h.includes("urgent")) return "⚡";
  if (h.includes("next") || h.includes("step")) return "👉";
  if (h.includes("week")) return "📅";
  if (h.includes("month")) return "🗓️";
  if (h.includes("research")) return "🔬";
  if (h.includes("outreach") || h.includes("marketing")) return "📣";
  if (h.includes("monetization") || h.includes("pricing") || h.includes("revenue")) return "💰";
  if (h.includes("timeline")) return "⏱️";
  if (h.includes("deploy") || h.includes("launch")) return "🚀";
  if (h.includes("blocked") || h.includes("blocker")) return "🚧";
  return "📌";
}
