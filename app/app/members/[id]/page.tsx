import { MemberDetailClient } from "./MemberDetailClient";
import { getHomeworksForMember, getMemberById } from "@/lib/db-server";
import { getMemberBriefing } from "@/lib/briefing/service";
import { getServerEnv } from "@/lib/server/env";
import { requireTrainer } from "@/lib/server/auth/session";
import { listSessionNotes } from "@/lib/server/db/repositories/session-notes";
import { listImportRecords } from "@/lib/server/db/repositories/members";

export const dynamic = "force-dynamic";

/** Member detail + 3-second briefing, read in parallel on the server (owner-scoped). */
export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trainerId }, env] = await Promise.all([requireTrainer(), getServerEnv()]);
  const [member, homeworks, sessionNotes, importRecords, briefing] = await Promise.all([
    getMemberById(id),
    getHomeworksForMember(id),
    listSessionNotes(env.DB, trainerId, id),
    listImportRecords(env.DB, trainerId, id),
    // The briefing is auxiliary: its failure must not hide the member record.
    getMemberBriefing(id).catch(() => null),
  ]);
  return <MemberDetailClient memberId={id} initial={{ member, briefing, homeworks, sessionNotes, importRecords }} />;
}
