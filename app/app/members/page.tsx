import { MembersClient } from "./MembersClient";
import { getCurrentTrainerProfile, getMembers } from "@/lib/db-server";

export const dynamic = "force-dynamic";

/** Server Component read: members + plan in parallel (two scoped D1 queries). */
export default async function MembersPage() {
  const [members, profile] = await Promise.all([getMembers(), getCurrentTrainerProfile()]);
  return <MembersClient initialMembers={members} profile={profile} />;
}
