import Link from "next/link";

interface ThemeChip {
  id: number;
  name: string;
  status: string | null;
  targetPrice: number | null;
}

interface TickerThemesTagsProps {
  themes: ThemeChip[];
  tags: string[];
}

const STATUS_COLORS: Record<string, string> = {
  watching: "bg-gray-100 text-gray-600 border-gray-200",
  accumulating: "bg-blue-50 text-blue-700 border-blue-200",
  holding: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function TickerThemesTags({ themes, tags }: TickerThemesTagsProps) {
  if (themes.length === 0 && tags.length === 0) {
    return null;
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      {themes.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Themes
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {themes.map((t) => {
              const statusCls =
                STATUS_COLORS[t.status || "watching"] || STATUS_COLORS.watching;
              return (
                <Link
                  key={t.id}
                  href={`/markets/scanner/themes#theme-${t.id}`}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-md border transition-colors hover:bg-gray-50 ${statusCls}`}
                >
                  <span className="font-medium">{t.name}</span>
                  {t.status && t.status !== "watching" && (
                    <span className="text-[10px] uppercase tracking-wide opacity-70">
                      {t.status}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Tags
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Link
                key={tag}
                href={`/markets/scanner/themes?tag=${encodeURIComponent(tag)}`}
                className="inline-flex items-center px-2 py-0.5 text-xs rounded-md border bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
