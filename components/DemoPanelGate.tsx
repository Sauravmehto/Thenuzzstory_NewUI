"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const DemoPanel = dynamic(() => import("./DemoPanel"), { ssr: false });

/** Shows demo controls in development, or in production with ?demo=1 (remembered for the session). */
export default function DemoPanelGate() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("demo");
      if (fromUrl === "1") sessionStorage.setItem("cp-demo-ui", "1");
      if (fromUrl === "0") sessionStorage.removeItem("cp-demo-ui");
      // The server only honours demo controls in development and the test build (lib/server/demo.ts).
      const allowed = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_STORE_PROFILE === "demo-usd";
      setEnabled(allowed && (process.env.NODE_ENV !== "production" || sessionStorage.getItem("cp-demo-ui") === "1"));
    } catch {
      setEnabled(process.env.NODE_ENV !== "production");
    }
  }, []);

  // Not over the admin screens.
  return enabled && !pathname.startsWith("/admin") ? <DemoPanel /> : null;
}
