import { Progress } from "@/components/ui/progress";

interface ScoreGaugeProps {
  score: number; // 0~100
  totalGaps: number;
}

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

function getScoreLabel(score: number) {
  if (score >= 80) return "최신 상태 양호";
  if (score >= 50) return "일부 업데이트 필요";
  return "대폭 업데이트 필요";
}

export function ScoreGauge({ score, totalGaps }: ScoreGaugeProps) {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">강의 최신화 점수</p>
          <p className={`text-5xl font-bold mt-1 ${getScoreColor(score)}`}>
            {score}
            <span className="text-xl font-normal text-muted-foreground">/ 100</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">발견된 갭</p>
          <p className="text-3xl font-bold text-slate-700">{totalGaps}개</p>
        </div>
      </div>
      <Progress value={score} className="h-3" />
      <p className={`text-sm font-medium ${getScoreColor(score)}`}>
        {getScoreLabel(score)}
      </p>
    </div>
  );
}
