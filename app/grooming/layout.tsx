import type { ReactNode } from "react";
// Grooming styles load only on /grooming pages, not with every page of the site.
import "../styles/grooming.css";

export default function GroomingLayout({ children }: { children: ReactNode }) {
  return children;
}
