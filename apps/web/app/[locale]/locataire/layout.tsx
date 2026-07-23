"use client";

import type { ReactNode } from "react";
import { PortalShell } from "@/components/PortalShell";

export default function LocataireLayout({ children }: { children: ReactNode }) {
  return <PortalShell role="locataire">{children}</PortalShell>;
}
