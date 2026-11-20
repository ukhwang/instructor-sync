import { redirect } from "next/navigation";
import { getTrainerSession } from "@/lib/server/auth/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

function safeNextPath(raw: string | string[] | undefined): string {
  const value = typeof raw === "string" ? raw : "";
  return value.startsWith("/app") && !value.startsWith("//") ? value : "/app";
}

/** Validated session → straight to the dashboard (no cookie-only redirect loops). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const nextPath = safeNextPath((await searchParams).next);
  if (await getTrainerSession().catch(() => null)) redirect(nextPath);
  return <LoginForm nextPath={nextPath} />;
}
