"use client";

import type { ReactNode } from "react";

import { DemoShell } from "@/components/demo/DemoShell";

/**
 * '로그인 없이 1분 체험하기' 샌드박스.
 * /app 하위가 아니므로 인증 가드와 무관하며, 모든 상태는 브라우저 메모리(React)에만 존재한다.
 */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoShell>{children}</DemoShell>;
}
