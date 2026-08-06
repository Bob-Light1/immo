import { NextRequest } from "next/server";
import { ticketSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createTicket, listTickets } from "@/lib/services/ticket.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Lists tickets — Admin (all) / others (their own) (§5.12). */
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

/** Opens a maintenance ticket — any authenticated user. */
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
