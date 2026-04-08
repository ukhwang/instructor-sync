import { Badge } from "@/components/ui/badge";
import { GapItem } from "@/lib/schemas";

const GAP_CONFIG = {
  OUTDATED: { label: "구식 정보", className: "bg-red-100 text-red-700 border-red-300" },
  MISSING:  { label: "누락 트렌드", className: "bg-orange-100 text-orange-700 border-orange-300" },
  VERIFY:   { label: "확인 필요", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
};

const SEVERITY_CONFIG = {
  HIGH:   { label: "높음", className: "bg-red-500 text-white" },
  MEDIUM: { label: "중간", className: "bg-orange-400 text-white" },
  LOW:    { label: "낮음", className: "bg-slate-400 text-white" },
};

interface GapBadgeProps {
  gapType: GapItem["gapType"];
  severity: GapItem["severity"];
}

export function GapBadge({ gapType, severity }: GapBadgeProps) {
  const gap = GAP_CONFIG[gapType];
  const sev = SEVERITY_CONFIG[severity];

  return (
    <span className="flex items-center gap-1.5">
      <Badge variant="outline" className={gap.className}>
        {gap.label}
      </Badge>
      <Badge className={sev.className}>{sev.label}</Badge>
    </span>
  );
}
