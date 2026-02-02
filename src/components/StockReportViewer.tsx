import { StockReport } from "@/lib/types";

function renderMarkdown(md: string): string {
  let html = md
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-gray-900 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-gray-900 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-gray-900 mt-6 mb-3">$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-700">$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="my-4 border-gray-200" />')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" class="text-emerald-600 hover:underline">$1</a>')
    // Line breaks — double newline = paragraph
    .replace(/\n\n/g, '</p><p class="text-sm text-gray-700 mb-2">')
    // Wrap consecutive list items
    .replace(
      /(<li[^>]*>.*?<\/li>\n?)+/g,
      (match) => `<ul class="mb-3 space-y-1">${match}</ul>`
    );

  // Wrap in paragraph
  html = `<p class="text-sm text-gray-700 mb-2">${html}</p>`;

  return html;
}

export function StockReportViewer({ report }: { report: StockReport }) {
  const date = new Date(report.created_at);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{report.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400">{dateStr}</span>
            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 uppercase">
              {report.report_type}
            </span>
          </div>
        </div>
        <span className="font-mono text-sm font-medium text-emerald-600">{report.ticker}</span>
      </div>
      <div
        className="prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(report.content) }}
      />
    </div>
  );
}
