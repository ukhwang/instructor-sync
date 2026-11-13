"use server";

import { z } from "zod";

import { createMilestoneReport } from "@/lib/milestone-server";

export type CreateMilestoneReportResult =
  | { ok: true; path: string; sessionNumber: number }
  | { ok: false; message: string };

const inputSchema = z.object({ memberId: z.uuid() });

/** 원장: 회원의 마일스톤 리포트 비밀 링크(30일 유효)를 발급한다. */
export async function createMilestoneReportAction(input: { memberId: string }): Promise<CreateMilestoneReportResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "회원 정보를 확인해주세요." };

  const outcome = await createMilestoneReport(parsed.data.memberId);
  if (!outcome.ok) return outcome;
  return { ok: true, path: `/report/${outcome.token}`, sessionNumber: outcome.sessionNumber };
}
