import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Service-level tests. The money services own the invariants that matter most
// (a payment must never be lost to a concurrent one, a published invoice must
// never be edited), and those live in the sequencing of Prisma calls rather
// than in any pure function — so Prisma is mocked and the services are driven
// directly. No database required.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
