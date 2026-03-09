"use client";

interface Props {
  name: string;
  color?: string | null;
  onRemove?: () => void;
}

export function TagBadge({ name, color, onRemove }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full"
      style={{
        backgroundColor: color ? `${color}20` : "#f3f4f6",
        color: color || "#6b7280",
      }}
    >
      {name}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70">
          ×
        </button>
      )}
    </span>
  );
}
