import { Queue, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { runEcheances } from "./jobs/echeances";
import { runReconductions } from "./jobs/reconductions";
import { runAnniversaires } from "./jobs/anniversaires";

export { runEcheances } from "./jobs/echeances";
export { runReconductions } from "./jobs/reconductions";
export { runAnniversaires } from "./jobs/anniversaires";

/**
 * Entry point for the recurring jobs (CampusGest §5.1, §5.6).
 *   - echeances     : daily at 07:00 — overdue lines + D-2/D0/D+3/D+7 alerts
 *   - anniversaires : daily at 08:00 — D-7 reminder (opt-in)
 *   - reconductions : monthly on the 1st at 06:00 — rolled-over drafts + guard
 *
 * Business logic lives in src/jobs/* (testable without Redis). This file only
 * schedules and runs them.
 */

// bullmq bundles its own copy of ioredis: the shared instance is valid at
// runtime but its types diverge from the root package — hence the cast.
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
