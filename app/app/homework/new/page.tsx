import { HomeworkNewClient } from "./HomeworkNewClient";
import { getMembers } from "@/lib/db-server";
import { requireTrainerPage } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

export default async function HomeworkNewPage({ searchParams }: { searchParams: Promise<{ memberId?: string | string[] }> }) {
  await requireTrainerPage("/app/homework/new");
  const query = await searchParams;
  const memberId = typeof query.memberId === "string" ? query.memberId : "";
  const members = await getMembers();
  return <HomeworkNewClient members={members} memberId={memberId} />;
}
