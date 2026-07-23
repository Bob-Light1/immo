"use client";

import type { ReactNode } from "react";
import { PortalShell } from "@/components/PortalShell";

export default function BailleurLayout({ children }: { children: ReactNode }) {
  return <PortalShell role="bailleur">{children}</PortalShell>;
}
