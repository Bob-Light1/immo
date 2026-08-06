import { NextRequest } from "next/server";
import { ticketSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createTicket, listTickets } from "@/lib/services/ticket.service";

// Réponse authentifiée : jamais de rendu statique (une seule variante servie à tous).
export const dynamic = "force-dynamic";

/** Liste des tickets — Admin (tous) / autres (les siens) (§5.12). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(await listTickets({ sub: user.sub, role: user.role }, { page, limit }));
  });
}

/** Ouvre un ticket de maintenance — tout utilisateur authentifié. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const input = ticketSchema.parse(await req.json());
    const ticket = await createTicket(user.sub, input);
    await audit(req, user.sub, "ticket.create", "maintenance_ticket", ticket.id, {
      categorie: input.categorie,
    });
    return json(ticket, { status: 201 });
  });
}
