"use client";

import { Progress } from "@/components/ui/progress";
import { Loader2, Search, CheckCircle } from "lucide-react";
import { useAnalysisStore } from "@/store/analysisStore";

const STEPS = [
  { key: "parsing",   icon: Loader2,       label: "PDF 텍스트 추출 중..." },
  { key: "analyzing", icon: Search,         label: "최신 웹 정보와 대조 중..." },
  { key: "completed", icon: CheckCircle,    label: "분석 완료!" },
];

export function AnalysisProgress() {
  const { status, progress } = useAnalysisStore();

  const currentStep = STEPS.find((s) => s.key === status) ?? STEPS[0];
  const Icon = currentStep.icon;
  const isCompleted = status === "completed";

  return (
    <div className="rounded-xl border bg-card p-8 space-y-5 text-center motion-safe:transition-all motion-safe:duration-500">
      <div className="flex justify-center">
        <div className={`p-4 rounded-full motion-safe:transition-colors motion-safe:duration-500 ${isCompleted ? "bg-green-100" : "bg-blue-50"}`}>
          <Icon
            className={`w-8 h-8 ${
              isCompleted
                ? "text-green-600"
                : "text-blue-600 animate-spin"
            }`}
          />
        </div>
      </div>

      <div>
        <p className="font-semibold text-lg">{currentStep.label}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {isCompleted ? "결과를 확인하세요" : `${progress}% 처리 완료`}
        </p>
      </div>

      <Progress value={progress} className="h-2 motion-safe:transition-all motion-safe:duration-500" />

      {/* 단계 인디케이터 */}
      <div className="flex justify-center gap-6 pt-2">
        {STEPS.slice(0, 2).map((step) => {
          const StepIcon = step.icon;
          const isActive = status === step.key;
          const isDone =
            (step.key === "parsing" && ["analyzing", "completed"].includes(status)) ||
            (step.key === "analyzing" && status === "completed");

          return (
            <div
              key={step.key}
              className={`flex items-center gap-1.5 text-xs ${
                isDone
                  ? "text-green-600"
                  : isActive
                  ? "text-blue-600 font-medium"
                  : "text-muted-foreground"
              }`}
            >
              <StepIcon className={`w-3.5 h-3.5 ${isActive ? "animate-spin" : ""}`} />
              {step.label.replace(" 중...", "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}
