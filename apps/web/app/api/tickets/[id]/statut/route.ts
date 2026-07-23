import { NextRequest } from "next/server";
import { ticketStatutSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { updateTicketStatut } from "@/lib/services/ticket.service";

/** Change le statut / la priorité / l'assignation d'un ticket — Admin (§5.12). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const input = ticketStatutSchema.parse(await req.json());
    const ticket = await updateTicketStatut(params.id, input);
    await audit(req, user.sub, "ticket.statut", "maintenance_ticket", params.id, {
      statut: input.statut,
    });
    return json(ticket);
  });
}
