import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed idempotent : crée (ou laisse en place) l'unique compte Admin.
 * Le mot de passe est temporaire et DOIT être changé à la première connexion
 * (firstLogin = true). Tout autre utilisateur est créé via l'interface Admin.
 */
async function main() {
  const username = process.env.ADMIN_DEFAULT_USERNAME ?? "admin";
  const password = process.env.ADMIN_DEFAULT_PASSWORD ?? "admin1234";

  if (password.length < 4) {
    throw new Error("ADMIN_DEFAULT_PASSWORD trop court.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { username },
    update: {}, // ne réinitialise pas un admin existant (re-déploiements sûrs)
    create: {
      username,
      passwordHash,
      role: Role.admin,
      fullName: "Administrateur Système",
      firstLogin: true,
    },
  });

  console.log(`✓ Admin « ${admin.username} » prêt (id: ${admin.id}).`);
  console.log("  → Mot de passe temporaire à changer dès la 1ère connexion.");
}

main()
  .catch((e) => {
    console.error("✗ Seed échoué :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
