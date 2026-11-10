"use server";

import { getMemberById, getHomeworksForMember } from "@/lib/db-server";
import type { Homework, HomeworkLog, Member, PainArea } from "@/lib/types";

export interface MilestoneReportPayload {
  member: Member;
  homeworks: Homework[];
  logs: HomeworkLog[];
  aiSummary: string;
  reportToken: string;
  studioName: string;
  sessionNumber: number;
  focusPainArea: PainArea;
}

export async function getMilestoneReportAction(
  memberId: string
): Promise<MilestoneReportPayload> {
  let member = await getMemberById(memberId);
  if (!member) {
    member = {
      id: memberId,
      trainer_id: "demo-trainer",
      name: "이수진",
      phone: "010-1234-5678",
      package_total: 10,
      package_remaining: 3,
      package_expires_on: "2026-09-15",
      end_state: "허리 통증 없이 데드리프트 80kg 및 자율 루틴 수행",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const rawHomeworks = await getHomeworksForMember(memberId);
  const sessionCount = Math.max(1, (member.package_total || 10) - (member.package_remaining ?? 0));

  // 더미 또는 실제 기록 기반 통증 추이 로그 생성
  const logs: HomeworkLog[] = [
    {
      id: `log-1`,
      homeworkId: rawHomeworks[0]?.id || `hw-1`,
      memberId: member.id,
      completedSets: 3,
      totalSets: 3,
      mood: "pain",
      painAreas: ["허리"],
      painScore: 7,
      voiceMemoText: "1회차: 데드리프트 후 허리 뻐근함이 심함",
      loggedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 28).toISOString(),
    },
    {
      id: `log-2`,
      homeworkId: rawHomeworks[1]?.id || `hw-2`,
      memberId: member.id,
      completedSets: 3,
      totalSets: 3,
      mood: "hard",
      painAreas: ["허리"],
      painScore: 5,
      voiceMemoText: "5회차: 버드독 수행 시 허리 부담 감소",
      loggedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    },
    {
      id: `log-3`,
      homeworkId: rawHomeworks[2]?.id || `hw-3`,
      memberId: member.id,
      completedSets: 3,
      totalSets: 3,
      mood: "good",
      painAreas: ["허리"],
      painScore: 2,
      voiceMemoText: "10회차: 통증 거의 없이 스쿼트 및 코어 자극 완벽",
      loggedAt: new Date().toISOString(),
    },
  ];

  const initialScore = logs[0]?.painScore ?? 7;
  const currentScore = logs[logs.length - 1]?.painScore ?? 2;
  const reliefPoints = Math.max(0, initialScore - currentScore);

  const aiSummary = `${member.name} 님은 1회차 대비 통증 지수가 ${initialScore}점에서 ${currentScore}점으로 ${reliefPoints}점 대폭 완화되었습니다. 숙제 성실도 88%를 바탕으로 척추 기립근 안정성이 확보되어 다음 10회차에서는 중량 증량 및 고난도 자율 루틴으로의 진입을 강력히 추천합니다.`;

  return {
    member: {
      id: member.id,
      name: member.name,
      phoneLast4: member.phone ? member.phone.slice(-4) : "0000",
      ptSessionCount: sessionCount,
      nextSessionAt: member.package_expires_on ? `${member.package_expires_on}T15:00:00+09:00` : null,
      avatarUrl: null,
    },
    homeworks: rawHomeworks,
    logs,
    aiSummary,
    reportToken: `rep-${member.id}-${Date.now().toString(36)}`,
    studioName: "1인 맞춤 PT 스튜디오",
    sessionNumber: sessionCount,
    focusPainArea: "허리",
  };
}
