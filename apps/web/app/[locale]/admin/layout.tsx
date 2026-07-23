"use client";

import type { ReactNode } from "react";
import { PortalShell } from "@/components/PortalShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PortalShell role="admin">{children}</PortalShell>;
}
