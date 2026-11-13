import "server-only";
import crypto from "crypto";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { REPORT_TOKEN_PATTERN, openedReportSchema, type OpenedReport } from "./milestone-report";

export type OpenReportOutcome =
  | { ok: true; report: OpenedReport }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "unavailable" };

export async function openMilestoneReport(token: string): Promise<OpenReportOutcome> {
  if (!REPORT_TOKEN_PATTERN.test(token)) return { ok: false, reason: "not_found" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("open_milestone_report", { p_token: token });
    if (error) return { ok: false, reason: "unavailable" };
    const parsed = openedReportSchema.safeParse(data);
    if (parsed.success) return { ok: true, report: parsed.data };
    const failure = z.object({ reason: z.enum(["not_found", "revoked", "expired"]) }).safeParse(data);
    return { ok: false, reason: failure.success ? failure.data.reason : "unavailable" };
  } catch {
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

const createResultSchema = z.union([
  z.object({ success: z.literal(true), token: z.string(), session_number: z.number().int() }),
  z.object({ success: z.literal(false), reason: z.string() }),
]);

export async function createMilestoneReport(memberId: string): Promise<CreateReportOutcome> {
  const token = crypto.randomBytes(12).toString("hex");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_milestone_report", { p_member_id: memberId, p_token: token });
    if (error) return { ok: false, message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요." };
    const parsed = createResultSchema.safeParse(data);
    if (!parsed.success) return { ok: false, message: "결과를 확인하지 못했어요. 다시 시도해주세요." };
    if (!parsed.data.success) {
      return { ok: false, message: CREATE_REASON_MESSAGE[parsed.data.reason] ?? "리포트를 만들지 못했어요." };
    }
    return { ok: true, token: parsed.data.token, sessionNumber: parsed.data.session_number };
  } catch {
    return { ok: false, message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요." };
  }
}
