"use client";

import { Check, ExternalLink, FileBarChart, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { QuickAssignDrawer } from "@/components/homework/QuickAssignDrawer";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DEMO_MEMBER_HOMEWORK_PATH, DEMO_REPORT_PATH, demoMemberHomeworkPath } from "@/lib/demo-seed";
import { copyToClipboard, toAbsoluteUrl, vibrate } from "@/lib/kakao-share";
import type { Homework } from "@/lib/types";

import { useDemo } from "./DemoProvider";

export interface DemoAssignTarget {
  memberId: string;
  /** 수업에서 연 경우 (원루프) */
  lessonId: string | null;
  label: string | null;
}

interface SharedHomework {
  homework: Homework;
  memberName: string;
}

function displayName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "");
}

export function buildDemoKakaoText(memberName: string, homework: Homework): string {
  const url = toAbsoluteUrl(demoMemberHomeworkPath(memberName));
  const lines = (homework.items ?? []).map(
    (item, index) => `${index + 1}. ${displayName(item.name ?? "운동")} ${item.target_sets ?? 3}세트`,
  );
  return `📋 [${memberName}님 오늘의 운동숙제]\n\n${lines.join("\n")}\n\n👉 바로 시작하기:\n${url}`;
}

/**
 * 숙제 출제(QuickAssignDrawer 재사용) → 체험용 공유 모달.
 * 출제가 끝나면 드로어를 닫고 데모 전용 공유 모달(카톡 문구 복사·회원 화면·리포트 미리보기)을 연다.
 */
export function DemoAssignLayer({ target, onClose }: { target: DemoAssignTarget | null; onClose: () => void }) {
  const demo = useDemo();
  const [shared, setShared] = useState<SharedHomework | null>(null);
  const [copied, setCopied] = useState(false);

  const member = target ? demo.members.find((item) => item.id === target.memberId) ?? null : null;

  const closeAll = () => {
    setShared(null);
    setCopied(false);
    onClose();
  };

  const kakaoText = shared ? buildDemoKakaoText(shared.memberName, shared.homework) : "";

  const copyKakaoText = () => {
    vibrate(12);
    void copyToClipboard(kakaoText).then((ok) => {
      setCopied(ok);
      if (ok) toast.success("카톡 메시지를 복사했어요. 체험 모드라 실제로 전송되진 않아요");
      else toast.error("복사하지 못했어요. 아래 문구를 길게 눌러 복사해 주세요");
    });
  };

  return (
    <>
      {target && member && !shared && (
        <QuickAssignDrawer
          key={`${target.memberId}-${target.lessonId ?? "member"}`}
          open
          onOpenChange={(open) => !open && closeAll()}
          members={demo.members}
          prefilledMember={member}
          lastHomeworkByMemberId={demo.lastHomeworkByMemberId}
          lesson={target.lessonId && target.label ? { lessonId: target.lessonId, label: target.label } : null}
          onGenerateWhy={demo.onGenerateWhy}
          onAssign={demo.onAssign}
          onAssigned={(homework) => {
            const name = demo.members.find((item) => item.id === homework.member_id)?.name ?? member.name;
            setShared({ homework, memberName: name });
          }}
        />
      )}

      <Sheet open={shared !== null} onOpenChange={(open) => !open && closeAll()}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-[28px] bg-white px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-3"
        >
          <span className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-slate-200" aria-hidden />
          <div className="text-center">
            <span className="mx-auto mb-2 inline-flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="size-6 stroke-[3]" aria-hidden />
            </span>
            <SheetTitle className="text-xl font-black tracking-tight text-slate-900">
              {shared?.memberName ?? "회원"}님 숙제 준비 완료!
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-slate-500">
              실제 서비스에선 이 문구를 카카오톡으로 보내요. 체험 모드는 전송·저장하지 않아요.
            </SheetDescription>
          </div>

          <pre className="mt-4 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-[var(--ui-border)] bg-slate-50 p-4 font-sans text-sm leading-relaxed text-slate-800">
            {kakaoText}
          </pre>

          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={copyKakaoText}
              className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] text-base font-black text-[#191919] transition-transform active:scale-[0.98]"
            >
              <MessageCircle className="size-5 fill-current" aria-hidden />
              {copied ? "복사 완료! 카톡에 붙여넣기" : "카톡 메시지 복사"}
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={shared ? demoMemberHomeworkPath(shared.memberName) : DEMO_MEMBER_HOMEWORK_PATH}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => vibrate(8)}
                className="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border border-[var(--ui-border)] bg-white text-sm font-bold text-slate-800 transition-transform active:scale-[0.98]"
              >
                <ExternalLink className="size-4" aria-hidden />
                회원 체험 화면 열기
              </a>
              <a
                href={DEMO_REPORT_PATH}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => vibrate(8)}
                className="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border border-[var(--ui-border)] bg-white text-sm font-bold text-slate-800 transition-transform active:scale-[0.98]"
              >
                <FileBarChart className="size-4" aria-hidden />
                리포트 미리보기
              </a>
            </div>
            <button
              type="button"
              onClick={closeAll}
              className="min-h-16 w-full rounded-2xl text-sm font-bold text-slate-500 transition-transform active:scale-[0.98]"
            >
              완료하고 닫기
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
