import { RenewalsClient } from "./RenewalsClient";
import { getMembers } from "@/lib/db-server";

export const dynamic = "force-dynamic";

/** Renewal candidates: members with 4 or fewer sessions left. */
export default async function RenewalsPage() {
  const members = await getMembers();
  return <RenewalsClient members={members.filter((member) => member.package_remaining <= 4)} />;
}
