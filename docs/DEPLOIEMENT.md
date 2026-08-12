# Déploiement en production — CampusGest (KingCity)

> Guide complet pour mettre CampusGest en ligne et le rendre **utilisable par
> tous les utilisateurs** (Admin, Bailleur, Locataires) depuis un navigateur,
> avec HTTPS, notifications push, workers planifiés et sauvegardes.
>
> Cible : un **VPS Linux unique** (Ubuntu 22.04+) piloté par Docker Compose.
> C'est l'option la plus simple, la moins chère et la mieux adaptée au contexte
> camerounais. Une variante « managé » (Vercel + services gérés) est décrite en
> annexe A.

---

## 0. Ce qui doit tourner en production

L'application n'est **pas** un simple site statique. Cinq briques doivent être
en ligne en permanence :

| Brique | Rôle | Contrainte |
|---|---|---|
| **web** (`apps/web`) | Next.js 14 (pages + API routes + SSE) | HTTPS **obligatoire** (PWA, Web Push, géoloc, cookie refresh `Secure`) |
| **workers** (`packages/workers`) | Jobs planifiés BullMQ (échéances, reconductions, anniversaires) | Process long séparé, redémarrage auto |
| **PostgreSQL** | Données métier (Prisma) | Volume persistant + sauvegardes |
| **Redis** | File BullMQ + relais SSE inter-process | Volume persistant |
| **MinIO** (ou S3) | Images posts/portfolio, documents, justificatifs | Bucket en lecture publique, servi via le proxy |

> **Pourquoi HTTPS est non négociable :** le service worker PWA, le Web Push
> (VAPID), la géolocalisation du signal de détresse et le cookie de refresh
> `HttpOnly; Secure` ne fonctionnent **que** sur un contexte sécurisé (HTTPS ou
> `localhost`). Sans domaine + TLS, l'app est inutilisable « en ligne ».

---

## 1. Prérequis

### 1.1 Serveur
- VPS Linux (Ubuntu 22.04/24.04 LTS recommandé).
- Dimensionnement de départ : **2 vCPU / 4 Go RAM / 40–80 Go SSD**. Suffisant
  pour une cité universitaire (dizaines à quelques centaines d'utilisateurs).
- Ports ouverts au pare-feu : **80** et **443** uniquement (le reste reste
  interne au réseau Docker). SSH (22) restreint à votre IP si possible.

### 1.2 Nom de domaine
- Un domaine ou sous-domaine, ex. `campus.kingcity.cm` ou `app.votre-domaine.cm`.
- Un enregistrement DNS **A** pointant vers l'IP publique du VPS.
  (Optionnel : `storage.votre-domaine.cm` en **A** vers la même IP si vous
  voulez servir MinIO sur un sous-domaine dédié — voir §6.)

### 1.3 Logiciels sur le serveur
```bash
sudo apt update && sudo apt install -y git ufw
# Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se reconnecter
docker --version && docker compose version
```

### 1.4 Pare-feu
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

---

## 2. Vue d'ensemble de l'architecture cible

```
                     Internet (HTTPS 443)
                            │
                    ┌───────▼────────┐
                    │  Caddy (proxy) │  TLS auto (Let's Encrypt)
                    └───┬────────┬───┘
             /  et /api │        │ /storage/*  (ou sous-domaine)
                    ┌───▼───┐ ┌──▼──────┐
                    │  web  │ │  minio  │  (bucket lecture publique)
                    │ :3000 │ │ :9000   │
                    └───┬───┘ └──┬──────┘
              ┌─────────┼────────┼──────────┐
        ┌─────▼─────┐ ┌─▼─────┐ ┌▼────────┐ │
        │ postgres  │ │ redis │ │ workers │ │  (réseau Docker privé)
        └───────────┘ └───────┘ └─────────┘
```

- **Un seul point d'entrée public** : le reverse proxy (Caddy) termine le TLS et
  route vers `web` et le stockage. Tout le reste reste privé.
- `web` et `workers` partagent la même base de code et la même base de données.

---

## 3. Préparation du code pour la production

> ✅ **Déjà appliqué dans le dépôt** — cette section documente ce qui a été fait
> à `apps/web/next.config.js`. Rien à refaire.

### 3.1 Sortie « standalone » de Next.js
Pour une image Docker légère, `next.config.js` active :
```js
const nextConfig = {
  output: "standalone",
  experimental: {
    // Racine du monorepo (sinon les workspaces packages/* ne sont pas tracés).
    // Sous `experimental` en Next 14 ; racine en Next 15.
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
  reactStrictMode: true,
  transpilePackages: ["@campusgest/shared", "@campusgest/db"],
  // ...reste inchangé
};
```

### 3.2 Cookie de refresh en `Secure` sous HTTPS
Vérifier que le cookie de rafraîchissement est émis avec `Secure` en production
(il doit déjà l'être si `NODE_ENV=production`). En prod l'app est servie en
HTTPS, donc `Secure; HttpOnly; SameSite=Lax` est correct — ne pas désactiver.

> Si vous préférez **ne pas** dockeriser le build, la variante PM2 (annexe B)
> n'exige pas `output: "standalone"`.

---

## 4. Variables d'environnement de production

Créer un fichier `.env` **sur le serveur** (jamais commité — il est déjà dans
`.gitignore`). Le modèle prêt pour la prod est **`.env.production.example`**
(hôtes Docker internes déjà renseignés) :

```bash
cp .env.production.example .env && nano .env   # remplacer tous les __...__
```

Extrait des valeurs à définir (voir le fichier pour la liste complète) :

```bash
# ─── Domaine public (certificat TLS Caddy) ─────────────────────
APP_DOMAIN=campus.votre-domaine.cm

# ─── Fuseau horaire de la cité (voir §11) ──────────────────────
# Les clés de mois (YYYY-MM) et les crons des workers sont lus sur l'horloge
# LOCALE des conteneurs, qui est en UTC sans cette variable.
TZ=Africa/Douala

# ─── Base de données (réseau Docker interne) ───────────────────
# POSTGRES_PASSWORD sert à Compose ET doit être répété LITTÉRALEMENT dans DATABASE_URL.
POSTGRES_PASSWORD=MOT_DE_PASSE_FORT
DATABASE_URL=postgresql://campusgest:MOT_DE_PASSE_FORT@postgres:5432/campusgest
REDIS_URL=redis://redis:6379

# ─── Auth : secrets uniques et longs (openssl rand -hex 32) ────
JWT_SECRET=__64_caracteres_aleatoires__
JWT_REFRESH_SECRET=__autre_64_caracteres_aleatoires__
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

# ─── URL publique réelle ───────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://campus.votre-domaine.cm
NODE_ENV=production

# ─── Web Push (VAPID) — générer une vraie paire (voir §5) ──────
VAPID_PUBLIC_KEY=__clé_publique__
VAPID_PRIVATE_KEY=__clé_privée__
VAPID_SUBJECT=mailto:admin@votre-domaine.cm

# ─── Stockage objet (MinIO en prod) ────────────────────────────
STORAGE_DRIVER=s3
S3_ENDPOINT=minio
S3_PORT=9000
S3_USE_SSL=false                 # interne au réseau Docker
S3_ACCESS_KEY=campusgest
S3_SECRET_KEY=__secret_minio_fort__
S3_BUCKET=campusgest
S3_REGION=us-east-1
# Optionnel : uniquement pour les fichiers enregistrés en URL absolue avant le
# passage aux chemins relatifs (voir §6). Vide sur une installation neuve.
S3_PUBLIC_URL=

# ─── Email / SMS / MoMo : optionnels (P1 : push seul actif) ────
SMTP_HOST=
SMTP_USER=
SMTP_PASS=

# ─── Seed admin : changer AVANT le premier boot ────────────────
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=__mot_de_passe_temporaire_solide__
```

Générer des secrets :
```bash
openssl rand -hex 32   # à répéter pour JWT_SECRET et JWT_REFRESH_SECRET
```

> ⚠️ **Ne jamais** garder les valeurs `change-me`, `campusgest/campusgest`,
> `admin1234` de l'exemple en production.

---

## 5. Générer les clés Web Push (VAPID)

Les notifications push (annonces, échéances, détresse) nécessitent une paire
VAPID **stable** (ne pas la régénérer, sinon les abonnements existants cassent) :

```bash
npx web-push generate-vapid-keys
```
Copier les deux clés dans `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` du `.env`.

---

## 6. Stockage objet : exposer MinIO publiquement

Les images et documents doivent être **accessibles depuis les navigateurs**. Le
`minio-init` du compose ouvre déjà le bucket en lecture anonyme ; il reste à le
router via le proxy.

L'application enregistre et affiche un **chemin relatif à son propre domaine**,
`/storage/<bucket>/<clé>` — jamais une URL absolue. Un changement de domaine, de
tunnel ou d'hébergeur ne peut donc pas invalider les fichiers déjà publiés, et
la CSP se limite à `img-src 'self'`.

**Routage (chemin `/storage`)** — un seul domaine : le proxy renvoie
`https://campus.votre-domaine.cm/storage/*` vers `minio:9000` en retirant le
préfixe (`handle_path`, voir le `Caddyfile` au §7.4). En développement, aucun
proxy n'est nécessaire : la route `app/storage/[...path]` sert les objets
directement, sur la même URL.

> `S3_PUBLIC_URL` n'intervient plus dans la construction des URLs. Ne le
> renseigner que pour continuer à servir des fichiers enregistrés en absolu
> avant ce changement : son origine reste alors autorisée par la CSP.

---

## 7. Fichiers de déploiement (déjà fournis dans le dépôt)

> ✅ **Ces fichiers sont déjà présents dans le dépôt et font foi** — inutile de
> les recréer. Ils complètent le `docker-compose.yml` de dev (conservé pour le
> développement local). Inventaire :
>
> | Fichier | Rôle |
> |---|---|
> | `apps/web/Dockerfile` | Image web (Next.js, sortie standalone + moteur Prisma) |
> | `packages/workers/Dockerfile` | Image workers, réutilisée pour `migrate`/`seed` |
> | `docker-compose.prod.yml` | Stack complète (db, redis, minio, migrate, seed, web, workers, caddy) |
> | `Caddyfile` | Reverse proxy + TLS auto (domaine via `APP_DOMAIN`) |
> | `.dockerignore` | Réduit le contexte de build, exclut `.env` |
> | `.env.production.example` | Modèle d'environnement de prod (§4) |
> | `scripts/backup-db.sh` | Sauvegarde PostgreSQL quotidienne (§10) |
> | `next.config.js` | Modifié : `output: "standalone"` + `outputFileTracingRoot` |
>
> Les extraits ci-dessous documentent le contenu ; en cas de divergence, **les
> fichiers du dépôt priment**.

### 7.1 `apps/web/Dockerfile`
```dockerfile
# --- deps + build ---
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/workers/package.json packages/workers/package.json
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

# --- runtime (standalone) ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

### 7.2 `packages/workers/Dockerfile`
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/workers/package.json packages/workers/package.json
RUN npm ci
COPY . .
RUN npm run db:generate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=builder /app ./
CMD ["npm", "run", "start", "-w", "@campusgest/workers"]
```

### 7.3 `docker-compose.prod.yml`
```yaml
services:
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: campusgest
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: campusgest
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U campusgest"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes: [redisdata:/data]

  minio:
    image: minio/minio:RELEASE.2024-06-13T22-53-53Z
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY}
    volumes: [miniodata:/data]

  minio-init:
    image: minio/mc:RELEASE.2024-06-12T14-34-03Z
    depends_on: { minio: { condition: service_started } }
    entrypoint: >
      /bin/sh -c "sleep 5;
      mc alias set local http://minio:9000 ${S3_ACCESS_KEY} ${S3_SECRET_KEY} &&
      mc mb --ignore-existing local/campusgest &&
      mc anonymous set download local/campusgest"

  migrate:
    build: { context: ., dockerfile: packages/workers/Dockerfile }
    depends_on: { postgres: { condition: service_healthy } }
    env_file: .env
    command: npm run db:deploy       # prisma migrate deploy (idempotent)
    restart: "no"

  seed:
    build: { context: ., dockerfile: packages/workers/Dockerfile }
    depends_on: { migrate: { condition: service_completed_successfully } }
    env_file: .env
    command: npm run db:seed         # crée l'admin (idempotent)
    restart: "no"

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    restart: unless-stopped
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    expose: ["3000"]

  workers:
    build: { context: ., dockerfile: packages/workers/Dockerfile }
    restart: unless-stopped
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddydata:/data
      - caddyconfig:/config
    depends_on: [web, minio]

volumes:
  pgdata:
  redisdata:
  miniodata:
  caddydata:
  caddyconfig:
```

> ⚠️ Le build web injecte `NEXT_PUBLIC_APP_URL` au moment du `npm run build`.
> Comme c'est une variable `NEXT_PUBLIC_*`, elle est figée dans le bundle : le
> `.env` doit contenir la bonne URL **avant** de builder (voir §4).

### 7.4 `Caddyfile` (HTTPS automatique)
```
campus.votre-domaine.cm {
    encode gzip

    # Stockage objet (images/documents) → MinIO
    handle_path /storage/* {
        reverse_proxy minio:9000
    }

    # Application Next.js (pages + API + SSE)
    reverse_proxy web:3000 {
        flush_interval -1        # streaming SSE des notifications
    }
}
```
Caddy obtient et renouvelle le certificat Let's Encrypt **automatiquement** dès
que le DNS pointe vers le serveur — aucune config TLS manuelle.

---

## 8. Procédure de mise en ligne (première fois)

> **Dépôt privé** — le serveur n'a pas vos identifiants GitHub. Générer sur le
> VPS une clé dédiée (`ssh-keygen -t ed25519 -C "vps-campusgest"`), coller la
> clé publique dans GitHub → *Settings → Deploy keys* du dépôt (lecture seule
> suffit), puis cloner en SSH. Sinon : URL HTTPS + jeton d'accès personnel.

> **Nom du dossier** — Compose préfixe les volumes avec le nom du répertoire
> (`campusgest_pgdata`, `campusgest_miniodata`…). Cloner dans un dossier nommé
> autrement change ces préfixes ; les commandes de sauvegarde du §10 supposent
> `campusgest`.

```bash
# 1. Récupérer le code sur le serveur
git clone git@github.com:Bob-Light1/immo.git campusgest && cd campusgest

# 2. Créer et remplir le .env de production (voir §4 et §5)
cp .env.production.example .env
nano .env          # APP_DOMAIN, secrets, VAPID, mots de passe (POSTGRES/MinIO/admin)
#   Le domaine Caddy vient de APP_DOMAIN : aucun autre fichier à éditer.

# 3. Build + démarrage de toute la stack
docker compose -f docker-compose.prod.yml up -d --build

# 4. Suivre : migration → seed → web/workers up
docker compose -f docker-compose.prod.yml logs -f migrate seed web
```

Les services `migrate` puis `seed` s'exécutent une fois (migrations Prisma +
création de l'admin), puis `web`, `workers`, `caddy` restent up.

### Vérifications
```bash
# Santé applicative (doit répondre {"status":"ok","db":"up"})
curl -s https://campus.votre-domaine.cm/api/health

# La page se charge et redirige vers /fr
curl -sI https://campus.votre-domaine.cm/ | head -n1
```
Puis, dans un navigateur :
1. Ouvrir `https://campus.votre-domaine.cm` → écran de connexion KingCity.
2. Se connecter avec `admin` / `ADMIN_DEFAULT_PASSWORD`.
3. **Changement d'identifiants imposé à la première connexion** → définir le vrai
   mot de passe admin.
4. Activer la 2FA TOTP dans le profil Admin (recommandé, §9 conception).
5. Créer les comptes Bailleur et Locataires (mot de passe temporaire affiché une
   seule fois → à transmettre à chaque utilisateur).
6. Tester : notification push (bouton dans la cloche), upload d'image sur un
   post, génération d'un reçu PDF.

À partir de là, **tous les utilisateurs** accèdent à l'app depuis leur navigateur
(mobile ou desktop) et peuvent l'« installer » (PWA : Ajouter à l'écran d'accueil).

---

## 9. Mises à jour (déploiements suivants)

```bash
cd campusgest
git pull
docker compose -f docker-compose.prod.yml up -d --build
# migrate/seed se rejouent automatiquement (idempotents) ;
# les nouvelles migrations Prisma sont appliquées par le service `migrate`.
```
Pour un downtime minimal, Caddy garde l'ancien conteneur jusqu'à ce que le
nouveau soit prêt. Toujours vérifier `/api/health` après.

---

## 10. Sauvegardes (indispensable)

### 10.1 PostgreSQL (quotidien)
Le script est **déjà dans le dépôt** — inutile d'en écrire un : il fait le dump
gzip horodaté, purge au-delà de 14 jours (`RETENTION_DAYS`) et écrit dans
`backups/` (`BACKUP_DIR`).
```bash
./scripts/backup-db.sh          # essai immédiat
crontab -e
# 0 2 * * * /home/USER/campusgest/scripts/backup-db.sh >> /var/log/campusgest-backup.log 2>&1
```

### 10.2 MinIO (documents/images)
```bash
# Le volume est préfixé par le nom du dossier cloné (voir §8) :
docker volume ls | grep miniodata
docker run --rm -v campusgest_miniodata:/source -v /opt/backups:/backup alpine \
  tar czf /backup/minio-$(date +%F).tar.gz -C /source .
```

### 10.3 Restauration (test à faire au moins une fois)
```bash
gunzip -c db-2026-07-07.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U campusgest campusgest
```
> Conserver une copie **hors du serveur** (autre machine / stockage distant).

---

## 11. Supervision & exploitation

- **Health check** : sonder `GET /api/health` toutes les 1–5 min (UptimeRobot,
  Healthchecks.io, ou cron interne). 503 = base injoignable.
- **Logs** : `docker compose -f docker-compose.prod.yml logs -f web workers`.
- **Jobs planifiés** : vérifier dans les logs `workers` que `echeances` (07:00),
  `anniversaires` (08:00) et `reconductions` (1er du mois 06:00) tournent.
  ⚠️ Ces horaires — comme les clés de mois `YYYY-MM` — sont lus sur l'horloge
  **du conteneur**, en UTC par défaut. `timedatectl` sur l'hôte n'y change rien :
  c'est `TZ` qui compte (`TZ=Africa/Douala` dans le `.env`, valeur par défaut
  déjà posée sur `web` et `workers` dans `docker-compose.prod.yml`). Vérifier :
  `docker compose -f docker-compose.prod.yml exec web date`.
- **Ressources** : `docker stats`. Passer à 4 vCPU / 8 Go si la charge grimpe.

---

## 12. Sécurité — checklist avant ouverture aux utilisateurs

- [ ] `JWT_SECRET` et `JWT_REFRESH_SECRET` uniques, ≥ 32 octets aléatoires.
- [ ] Mots de passe Postgres et MinIO changés (pas les valeurs d'exemple).
- [ ] `ADMIN_DEFAULT_PASSWORD` fort **et** changé dès la 1re connexion.
- [ ] 2FA TOTP activée sur le compte Admin.
- [ ] HTTPS actif (cadenas vert) + HSTS présent (en-tête ajouté en prod par
      `next.config.js`).
- [ ] Pare-feu : seuls 80/443 (+ SSH restreint) exposés ; Postgres/Redis/MinIO
      **jamais** publiés directement.
- [ ] Console MinIO (`:9001`) **non exposée** publiquement (pas de route proxy).
- [ ] Clés VAPID stables et sauvegardées.
- [ ] Fuseau des conteneurs = celui de la cité :
      `docker compose -f docker-compose.prod.yml exec web date` (§11).
- [ ] Sauvegardes automatiques vérifiées (dump + restauration testée).
- [ ] `.env` de prod hors du dépôt Git.

---

## Annexe A — Variante « managé » (sans VPS à administrer)

Plus rapide à lancer, mais plus cher et **inadapté aux workers/SSE de longue
durée** :

- **web** → Vercel (build Next.js natif). ⚠️ Les **workers BullMQ ne tournent
  pas** sur Vercel (pas de process persistant) : il faut les héberger ailleurs
  (Railway / Render / petit VPS) **ou** convertir les jobs en Vercel Cron +
  fonctions. Le SSE de notifications fonctionne mal en serverless.
- **PostgreSQL** → Neon / Supabase / Railway (fournit `DATABASE_URL`).
- **Redis** → Upstash / Railway (fournit `REDIS_URL`).
- **Stockage** → un vrai S3 (AWS S3, Cloudflare R2, Backblaze B2) : renseigner
  les `S3_*` ; le préfixe public `/storage` reste servi par le proxy.

Conclusion : pour CampusGest (workers planifiés + SSE + PWA + stockage), **le VPS
Docker (corps du guide) reste l'option la plus cohérente et économique.**

## Annexe B — Variante VPS sans Docker (PM2)

Si Docker n'est pas souhaité :
1. Installer Node 20, PostgreSQL, Redis, MinIO nativement sur le VPS.
2. `npm ci && npm run db:generate && npm run db:deploy && npm run db:seed`.
3. `npm run build` puis lancer avec **PM2** :
   ```bash
   pm2 start "npm run start -w @campusgest/web" --name web
   pm2 start "npm run start -w @campusgest/workers" --name workers
   pm2 save && pm2 startup
   ```
4. Mettre **Caddy** ou **Nginx** devant (TLS + reverse proxy vers `:3000` et
   `/storage` → MinIO `:9000`), comme au §7.4.

Dans ce mode, `output: "standalone"` n'est pas requis.

---

**Résumé express** — pour être en ligne et utilisable par tous :
DNS → VPS · `.env` prod (secrets + VAPID + domaine) · `docker compose -f
docker-compose.prod.yml up -d --build` (migrate + seed + web + workers + minio +
Caddy/HTTPS) · connexion admin + changement mot de passe + 2FA · création des
comptes · sauvegardes + monitoring.
