import type { LucideIcon } from "lucide-react";

export function StatCard({
  title,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  title: string;
  value: string;
  icon?: LucideIcon;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-5 transition ${
        accent
          ? "border-primary/40 bg-surface shadow-[var(--shadow-gold)]"
          : "border-border bg-surface hover:border-primary/30"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{title}</span>
        {Icon && <Icon size={18} className="text-primary" />}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${accent ? "text-gold" : ""}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
