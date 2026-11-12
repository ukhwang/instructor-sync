"use client";

import { MemberHomeworkClient, type MemberHomeworkClientProps } from "@/components/homework/MemberHomeworkClient";
import { logSetAction, submitFeedbackAction } from "@/app/actions/homework";

export interface MemberHomeworkContainerProps {
  homework: MemberHomeworkClientProps["homework"];
  member: MemberHomeworkClientProps["member"];
}

export function MemberHomeworkContainer({ homework, member }: MemberHomeworkContainerProps) {
  return (
    <MemberHomeworkClient
      homework={homework}
      member={member}
      onLogSet={logSetAction}
      onSubmitFeedback={submitFeedbackAction}
    />
  );
}
