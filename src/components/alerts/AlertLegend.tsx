export function AlertLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      <span className="font-medium">Legend:</span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-amber-100"></span>
        In Accumulate Zone
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-emerald-100"></span>
        In Strong Buy Zone
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-red-100"></span>
        Below Strong Buy
      </span>
    </div>
  );
}
