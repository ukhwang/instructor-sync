"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

export function UpgradeModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
             <Zap className="w-5 h-5 text-blue-600" />
             Pro 플랜으로 업그레이드
          </DialogTitle>
          <DialogDescription>
            무료 분석 횟수(3회)를 모두 소진하셨습니다.
            무제한 분석과 심층 리포트를 위해 Pro 플랜으로 업그레이드하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="p-4 rounded-xl border bg-slate-50 space-y-2">
            <h4 className="font-semibold text-sm">Pro 플랜 혜택</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>무제한 교안 분석 (월 100회)</li>
              <li>상위 1% 강사들의 트렌드 리포트 열람</li>
              <li>PDF 외 PPT, Word 파일 완벽 지원</li>
              <li>우선 순위 AI 서버 할당 (빠른 분석)</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            나중에 하기
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => alert("결제 시스템 연동 예정")}>
            월 ₩9,900에 시작하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
