import { RenewalsClient } from "./RenewalsClient";
import { getMembers } from "@/lib/db-server";
import { requireTrainerPage } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

/** Renewal candidates: members with 4 or fewer sessions left. */
export default async function RenewalsPage() {
  // Page and layout render concurrently: redirect here too instead of throwing from data reads.
  await requireTrainerPage("/app/renewals");
  const members = await getMembers();
  return <RenewalsClient members={members.filter((member) => member.package_remaining <= 4)} />;
}
