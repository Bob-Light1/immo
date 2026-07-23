import { Queue, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { runEcheances } from "./jobs/echeances";
import { runReconductions } from "./jobs/reconductions";
import { runAnniversaires } from "./jobs/anniversaires";

export { runEcheances } from "./jobs/echeances";
export { runReconductions } from "./jobs/reconductions";
export { runAnniversaires } from "./jobs/anniversaires";

/**
 * Point d'entrée des jobs récurrents (CampusGest §5.1, §5.6).
 *   - echeances     : quotidien à 07:00 — retards + alertes J-2/J0/J+3/J+7
 *   - anniversaires : quotidien à 08:00 — rappel J-7 (opt-in)
 *   - reconductions : mensuel le 1er à 06:00 — brouillons reconduits + garde-fou
 *
 * La logique métier vit dans src/jobs/* (testable hors Redis). Ici on se
 * contente de planifier et d'exécuter.
 */

// bullmq embarque sa propre copie d'ioredis : l'instance partagée est valide à
// l'exécution mais ses types divergent du paquet racine — d'où le cast.
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
}) as unknown as ConnectionOptions;

export const echeancesQueue = new Queue("echeances", { connection });
export const anniversairesQueue = new Queue("anniversaires", { connection });
export const reconductionsQueue = new Queue("reconductions", { connection });

async function scheduleRepeatables() {
  await echeancesQueue.add(
    "daily",
    {},
    { repeat: { pattern: "0 7 * * *" }, jobId: "echeances-daily" },
  );
  await anniversairesQueue.add(
    "daily",
    {},
    { repeat: { pattern: "0 8 * * *" }, jobId: "anniversaires-daily" },
  );
  await reconductionsQueue.add(
    "monthly",
    {},
    { repeat: { pattern: "0 6 1 * *" }, jobId: "reconductions-monthly" },
  );
}

new Worker(
  "echeances",
  async (job) => {
    const res = await runEcheances();
    console.log(`[echeances] ${job.id}`, res);
    return res;
  },
  { connection },
);

new Worker(
  "anniversaires",
  async (job) => {
    const res = await runAnniversaires();
    console.log(`[anniversaires] ${job.id}`, res);
    return res;
  },
  { connection },
);

new Worker(
  "reconductions",
  async (job) => {
    const res = await runReconductions();
    console.log(`[reconductions] ${job.id}`, res);
    return res;
  },
  { connection },
);

scheduleRepeatables()
  .then(() =>
    console.log("✓ CampusGest workers démarrés (BullMQ) — échéances · anniversaires · reconductions."),
  )
  .catch((e) => console.error("[workers] planification échouée", e));
