"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getMembers } from "@/lib/db";
import { Member } from "@/lib/types";
import { QuickAssignDrawer } from "@/components/homework/QuickAssignDrawer";
import { generateWhyAction, assignHomeworkAction, scheduleNextSessionAction } from "@/app/actions/homework";

function HomeworkNewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const memberId = searchParams.get("memberId") || "";

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMembers().then((res) => {
      setMembers(res);
      setLoading(false);
    });
  }, []);

  const prefilledMember = members.find((m) => m.id === memberId) || null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <p className="text-sm font-bold">숙제 출제 화면 준비 중…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <QuickAssignDrawer
        open={true}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            if (memberId) {
              router.push(`/app/members/${memberId}`);
            } else {
              router.push("/app");
            }
          }
        }}
        members={members}
        prefilledMember={prefilledMember}
        lastHomeworkByMemberId={{}}
        onGenerateWhy={generateWhyAction}
        onAssign={assignHomeworkAction}
        onScheduleNextSession={scheduleNextSessionAction}
      />
    </div>
  );
}

export default function HomeworkNewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-white">화면 불러오는 중…</div>}>
      <HomeworkNewPageContent />
    </Suspense>
  );
}
