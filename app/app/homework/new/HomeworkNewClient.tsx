"use client";

import { useRouter } from "next/navigation";
import type { Member } from "@/lib/types";
import { QuickAssignDrawer } from "@/components/homework/QuickAssignDrawer";
import { generateWhyAction, assignHomeworkAction } from "@/app/actions/homework";

export function HomeworkNewClient({ members, memberId }: { members: Member[]; memberId: string }) {
  const router = useRouter();
  const prefilledMember = members.find((m) => m.id === memberId) || null;

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
      />
    </div>
  );
}
