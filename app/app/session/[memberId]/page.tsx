import { SessionPrepClient } from "./SessionPrepClient";
import { getHomeworksForMember, getMemberById } from "@/lib/db-server";
import { getServerEnv } from "@/lib/server/env";
import { requireTrainerPage } from "@/lib/server/auth/session";
import { listSessionNotes } from "@/lib/server/db/repositories/session-notes";
import { listImportRecords } from "@/lib/server/db/repositories/members";

export const dynamic = "force-dynamic";

/** Next-session prep: member, latest homework, notes and imported history read on the server. */
export default async function NextSessionAlertPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const [{ trainerId }, env] = await Promise.all([requireTrainerPage(`/app/session/${memberId}`), getServerEnv()]);
  const [member, homeworks, sessionNotes, importRecords] = await Promise.all([
    getMemberById(memberId),
    getHomeworksForMember(memberId),
    listSessionNotes(env.DB, trainerId, memberId),
    listImportRecords(env.DB, trainerId, memberId),
  ]);
  return (
    <SessionPrepClient
      memberId={memberId}
      initial={{ member, latestHomework: homeworks[0] ?? null, sessionNotes, importRecords }}
    />
  );
}
