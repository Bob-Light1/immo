import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { adminDashboard, bailleurDashboard } from "@/lib/services/dashboard.service";

/** Tableau de bord selon le rôle (Admin : global · Bailleur : financier) — §6. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin", "bailleur");
    const data = user.role === "admin" ? await adminDashboard() : await bailleurDashboard();
    return json(data);
  });
}
