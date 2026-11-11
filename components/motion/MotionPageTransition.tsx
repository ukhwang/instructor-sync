"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

export function MotionPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{
        duration: 0.22,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="will-change-transform"
    >
      {children}
    </motion.div>
  );
}
