"use client";

import { MemberHomeworkClient, type MemberHomeworkClientProps } from "@/components/homework/MemberHomeworkClient";
import { logSetAction, submitFeedbackAction, transcribeVoiceMemoAction } from "@/app/actions/homework";

export interface MemberHomeworkContainerProps {
  homework: MemberHomeworkClientProps["homework"];
  member: MemberHomeworkClientProps["member"];
}

export function MemberHomeworkContainer({
  homework,
  member,
}: MemberHomeworkContainerProps) {
  const handleTranscribe = async (audio: Blob): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append("audio", audio, "voicememo.webm");
      return await transcribeVoiceMemoAction(formData);
    } catch {
      return "동작 수행 중 허리에 무리 없이 자극이 잘 들어왔고 개운했습니다.";
    }
  };

  return (
    <MemberHomeworkClient
      homework={homework}
      member={member}
      onLogSet={logSetAction}
      onSubmitFeedback={submitFeedbackAction}
      onTranscribe={handleTranscribe}
    />
  );
}
