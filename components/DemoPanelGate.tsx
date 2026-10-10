"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const DemoPanel = dynamic(() => import("./DemoPanel"), { ssr: false });

/** Shows demo controls in development, or in production with ?demo=1 (remembered for the session). */
export default function DemoPanelGate() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("demo");
      if (fromUrl === "1") sessionStorage.setItem("cp-demo-ui", "1");
      if (fromUrl === "0") sessionStorage.removeItem("cp-demo-ui");
      setEnabled(process.env.NODE_ENV !== "production" || sessionStorage.getItem("cp-demo-ui") === "1");
    } catch {
      setEnabled(process.env.NODE_ENV !== "production");
    }
  }, []);

  return enabled ? <DemoPanel /> : null;
}
