"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function TrainerNav() {
  const pathname = usePathname();
  const router = useRouter();
  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const navItems = [
    { label: "홈", href: "/app" },
    { label: "회원", href: "/app/members" },
    { label: "상담 큐", href: "/app/renewals" },
  ];

  return (
    <header className="bg-white border-b-4 border-black sticky top-0 z-40">
      <div className="brutalist-container py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="text-xl font-black tracking-tight uppercase bg-[var(--ui-accent)] text-white px-3 py-1.5 rounded-xl hover:bg-[#3d6b4b] transition-colors"
          >
            운동숙제
          </Link>
          <span className="hidden md:inline-block font-mono text-xs font-bold text-neutral-600">
            수업↔수업 연결 MSP
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="order-3 w-full sm:order-none sm:w-auto flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {navItems.map((item) => {
            const isActive =
              item.href === "/app"
                ? pathname === "/app"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-bold px-3 py-2 rounded-xl whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-[var(--ui-accent-light)] text-[var(--ui-accent)]"
                    : "text-neutral-600 hover:bg-[var(--ui-accent-light)] hover:text-[var(--ui-accent)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSignOut}
            className="text-xs font-bold px-3 py-2 rounded-xl border border-[var(--ui-border)] bg-white hover:bg-[var(--ui-accent-light)]"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
