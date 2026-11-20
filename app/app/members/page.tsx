import { MembersClient } from "./MembersClient";
import { getCurrentTrainerProfile, getMembers } from "@/lib/db-server";
import { requireTrainerPage } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/** Server Component read: members + plan in parallel (two scoped D1 queries). */
export default async function MembersPage() {
  // Page and layout render concurrently: redirect here too instead of throwing from data reads.
  await requireTrainerPage("/app/members");
  const [members, profile] = await Promise.all([getMembers(), getCurrentTrainerProfile()]);
  return <MembersClient initialMembers={members} profile={profile} />;
}
