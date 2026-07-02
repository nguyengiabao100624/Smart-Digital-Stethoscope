import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  delta?: string;
  deltaPositive?: boolean;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  accent?: string;
  onClick?: () => void;
}

export function KPICard({
  title,
  value,
  delta,
  deltaPositive,
  icon: Icon,
  iconColor = "#0B5C9A",
  iconBg = "#E6F1F8",
  accent,
  onClick,
}: KPICardProps) {
  return (
    <div
      className="bg-white rounded-xl p-5 border cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderColor: "#E2E8F0" }}
      onClick={onClick}
    >
      {accent && <div className="h-1 rounded-full mb-4" style={{ background: accent }} />}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0F172A", lineHeight: 1.1 }}>
            {value}
          </div>
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>
      </div>
      {delta && (
        <div style={{ fontSize: 12, color: deltaPositive ? "#059669" : "#DC2626" }}>
          {deltaPositive ? "↑" : "↓"} {delta}
        </div>
      )}
    </div>
  );
}
