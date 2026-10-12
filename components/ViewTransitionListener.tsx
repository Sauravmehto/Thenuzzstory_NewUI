"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { routeRendered } from "@/lib/view-transition";

/** Tells a pending view transition that the new route has rendered and painted. */
export default function ViewTransitionListener() {
  const pathname = usePathname();
  useEffect(() => {
    // Two frames: React has committed and the browser has painted the new page.
    const id = requestAnimationFrame(() => requestAnimationFrame(routeRendered));
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return null;
}
