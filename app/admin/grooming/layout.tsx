import type { ReactNode } from "react";
// The admin reuses the customer calendar and Reel card, so it needs both stylesheets.
import "../../styles/grooming.css";
import "../../styles/grooming-admin.css";

export default function AdminGroomingLayout({ children }: { children: ReactNode }) {
  return children;
}
