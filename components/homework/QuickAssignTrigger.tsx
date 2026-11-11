"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { QuickAssignDrawer, type SuggestedNextSession } from "./QuickAssignDrawer";
import { generateWhyAction, assignHomeworkAction, scheduleNextSessionAction } from "@/app/actions/homework";
import type { Homework, Member } from "@/lib/types";

interface QuickAssignTriggerProps {
  members: Member[];
  prefilledMember?: Member | null;
  buttonLabel?: string;
  buttonClassName?: string;
  lastHomeworkByMemberId?: Partial<Record<string, Homework>>;
  suggestedNextSession?: SuggestedNextSession | null;
  className?: string;
  onAssigned?: (homework: Homework) => void;
}

export function QuickAssignTrigger({
  members,
  prefilledMember = null,
  buttonLabel = "⚡ 15초 빠른 숙제 출제",
  buttonClassName = "",
  lastHomeworkByMemberId = {},
  suggestedNextSession = null,
  className = "",
  onAssigned,
}: QuickAssignTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ||
          `inline-flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm rounded-xl shadow-sm border-2 border-neutral-950 active:scale-95 transition-all ${className}`
        }
      >
        <Zap className="w-4 h-4 text-neutral-950 fill-neutral-950" />
        <span>{buttonLabel}</span>
      </button>

      <QuickAssignDrawer
        open={open}
        onOpenChange={setOpen}
        members={members}
        prefilledMember={prefilledMember}
        lastHomeworkByMemberId={lastHomeworkByMemberId}
        suggestedNextSession={suggestedNextSession}
        onGenerateWhy={generateWhyAction}
        onAssign={assignHomeworkAction}
        onScheduleNextSession={scheduleNextSessionAction}
        onAssigned={onAssigned}
      />
    </>
  );
}
