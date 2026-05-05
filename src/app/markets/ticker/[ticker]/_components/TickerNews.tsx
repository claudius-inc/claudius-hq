import { ExternalLink } from "lucide-react";

export interface NewsItem {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number | string | Date;
  type?: string;
}

interface TickerNewsProps {
  news: NewsItem[];
  ticker: string;
}

function formatRelative(value: number | string | Date | undefined): string {
  if (!value) return "";
  let ts: number;
  if (value instanceof Date) ts = value.getTime();
  else if (typeof value === "string") ts = new Date(value).getTime();
  else ts = Number(value) * (Number(value) < 1e12 ? 1000 : 1);
  if (!Number.isFinite(ts)) return "";

  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TickerNews({ news, ticker }: TickerNewsProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        News
      </h2>
      {news.length === 0 ? (
        <p className="text-sm text-gray-400">No recent news for {ticker}.</p>
      ) : (
        <ul className="space-y-3">
          {news.map((item, idx) => (
            <li
              key={item.uuid || `${item.link}-${idx}`}
              className="flex gap-3"
            >
              <div className="flex-1 min-w-0">
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-900 hover:text-emerald-600 transition-colors inline-flex items-baseline gap-1"
                  >
                    <span>{item.title || "(untitled)"}</span>
                    <ExternalLink className="w-3 h-3 text-gray-300 shrink-0" />
                  </a>
                ) : (
                  <span className="text-sm text-gray-900">
                    {item.title || "(untitled)"}
                  </span>
                )}
                <div className="mt-0.5 text-xs text-gray-400 flex items-center gap-2">
                  {item.publisher && <span>{item.publisher}</span>}
                  {item.publisher && item.providerPublishTime && (
                    <span>·</span>
                  )}
                  {item.providerPublishTime && (
                    <span>{formatRelative(item.providerPublishTime)}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
