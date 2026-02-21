"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const CLAMPED_PATHS = ["/chess", "/avalon"];

export function ViewportClamp() {
  const pathname = usePathname();

  useEffect(() => {
    const clamped = pathname
      ? CLAMPED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
      : false;
    if (typeof document !== "undefined") {
      if (clamped) {
        document.documentElement.classList.add("clamped-viewport");
        document.body.classList.add("clamped-viewport");
      } else {
        document.documentElement.classList.remove("clamped-viewport");
        document.body.classList.remove("clamped-viewport");
      }
    }
  }, [pathname]);

  return null;
}
