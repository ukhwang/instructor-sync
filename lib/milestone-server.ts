import "server-only";
import { z } from "zod";
import { REPORT_TOKEN_PATTERN, openedReportSchema, type OpenedReport } from "./milestone-report";
import { AuthRequiredError, requireTrainer } from "@/lib/server/auth/session";
import { getServerEnv } from "@/lib/server/env";
import * as reports from "@/lib/server/db/repositories/milestone-reports";

export type OpenReportOutcome =
  | { ok: true; report: OpenedReport }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "unavailable" };

/** Public read by token (no login). The memo free text is never returned (audit NV-1). */
export async function openMilestoneReport(token: string): Promise<OpenReportOutcome> {
  if (!REPORT_TOKEN_PATTERN.test(token)) return { ok: false, reason: "not_found" };
  try {
    const env = await getServerEnv();
    const data = await reports.openMilestoneReport(env.DB, token);
    const parsed = openedReportSchema.safeParse(data);
    if (parsed.success) return { ok: true, report: parsed.data };
    const failure = z.object({ reason: z.enum(["not_found", "revoked", "expired"]) }).safeParse(data);
    return { ok: false, reason: failure.success ? failure.data.reason : "unavailable" };
  } catch (error) {
    console.error("[report] open failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return { ok: false, reason: "unavailable" };
  }
}

export type CreateReportOutcome =
  | { ok: true; token: string; sessionNumber: number }
  | { ok: false; message: string };

const CREATE_REASON_MESSAGE: Record<string, string> = {
  unauthorized: "로그인이 만료되었어요. 다시 로그인해주세요.",
  member_not_found: "회원 정보를 찾을 수 없어요.",
  invalid_token: "링크를 만들지 못했어요. 다시 시도해주세요.",
};

export async function createMilestoneReport(memberId: string): Promise<CreateReportOutcome> {
  try {
    const { trainerId } = await requireTrainer();
    const env = await getServerEnv();
    const result = await reports.createMilestoneReport(env.DB, trainerId, memberId);
    if (!result.success) return { ok: false, message: CREATE_REASON_MESSAGE[result.reason] ?? "리포트를 만들지 못했어요." };
    return { ok: true, token: result.token, sessionNumber: result.session_number };
  } catch (error) {
    if (error instanceof AuthRequiredError) return { ok: false, message: CREATE_REASON_MESSAGE.unauthorized };
    console.error("[report] create failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return { ok: false, message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요." };
  }
}
