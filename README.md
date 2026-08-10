# CampusGest

Application web (PWA) de gestion d'une cité universitaire au Cameroun.
Monorepo **Turborepo** — Next.js 14 · Tailwind · PostgreSQL · Prisma · Node.js.

> Conception détaillée : voir `CampusGest_Conception_v2.pdf`.

## Structure

```
campusgest/
├─ apps/
│  └─ web/            # Next.js 14 (App Router) + Tailwind + next-intl + PWA
├─ packages/
│  ├─ db/             # Prisma : schema, migrations, seed (admin idempotent)
│  ├─ shared/         # Types + schémas Zod + calculs (répartition factures)
│  └─ workers/        # Jobs BullMQ (échéances, anniversaires, reconductions)
├─ docker-compose.yml # PostgreSQL + Redis + MinIO (stockage objet, dev)
└─ turbo.json
```

## Démarrage rapide

Prérequis : Node ≥ 20, Docker.

```bash
# 1. Dépendances
npm install

# 2. Base de données + Redis
docker compose up -d
cp .env.example .env        # (un .env de dev est déjà fourni)

# 3. Prisma : génération du client + migration + seed admin
npm run db:generate
npm run db:migrate          # crée les tables (migration initiale)
npm run db:seed             # crée le compte admin (admin / admin1234)

# 4. Lancer l'app
npm run dev                 # http://localhost:3000  -> redirige vers /fr
```

Vérifier la santé : `curl http://localhost:3000/api/health`.

## Scripts racine

| Script | Description |
|---|---|
| `npm run dev` | Lance tous les apps en mode dev (turbo) |
| `npm run build` | Build de production |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` (prod) |
| `npm run db:seed` | Seed admin idempotent |
| `npm run db:studio` | Prisma Studio |

## État

**P1 livré** — la boucle métier complète est utilisable :

- Authentification JWT + changement d'identifiants obligatoire à la 1re connexion.
- Portail **Admin** : gestion des utilisateurs (création avec mot de passe
  temporaire affiché une fois, désactivation), factures (création brouillon →
  coefficients → publication → encaissement, y compris paiements partiels).
- Portail **Bailleur** : consultation des factures et de la répartition par locataire.
- Portail **Locataire** : « Mes factures » (publiées uniquement) + reste à payer.
- i18n FR/EN/DE complet, icônes PWA, clés VAPID de dev dans `.env`.

**Audit d'alignement conception v2.0 (juin 2026)** — divergences corrigées :

- Rotation des jetons : `POST /api/auth/refresh` + `/api/auth/logout`,
  rafraîchissement auto côté client sur 401 (§4, §8.1).
- Locataires désactivés exclus des factures brouillon, répartition recalculée
  (à la désactivation et à la publication) ; les factures publiées restent figées (§5.1).
- Paiement refusé s'il dépasse le solde restant (§5.2).
- Journal `audit_logs` sur toutes les actions sensibles (FIX-6, §9).
- Rate limiting `/api/auth/login` : 10 essais / 15 min par IP et par compte (§9).
- Listes paginées `?page&limit` + filtres (`statut`, `role`, `active`) (§8).
- Fix sérialisation `Prisma.Decimal` en build de production (coefficients).

**Complément P1 (juin 2026)** — boucle métier complétée :

- Reçus de paiement PDF : `GET /api/paiements/:id/recu` (Admin, Bailleur ou
  locataire propriétaire). Générateur PDF maison, sans dépendance, police
  WinAnsi (accents FR). Liens de téléchargement dans le détail facture (Admin)
  et « Mes factures » (Locataire) (§5.2).
- Tableaux de bord `GET /api/dashboard` (selon le rôle) — §6 :
  - **Admin** : KPI (locataires actifs, factures du mois, taux de paiement,
    impayés en retard, tickets ouverts), graphe facturé vs encaissé 12 mois,
    répartition par mode, tableau des impayés, activité récente (audit_logs).
  - **Bailleur** : KPI financiers, tendance 6 mois, impayés (la liste des
    factures passe sous `/bailleur/factures`).
- Jobs workers (BullMQ + Redis), logique testable hors Redis dans
  `packages/workers/src/jobs/` :
  - **echeances** (quotidien) : passe les lignes échues en `retard` et émet une
    alerte in-app J-2 / J0 / J+3 / J+7 (idempotent ; jours calculés en dates
    calendaires UTC pour éviter tout décalage de fuseau).
  - **reconductions** (mensuel) : crée un brouillon `is_reconducted` repris du
    mois précédent, notifie l'Admin, et alerte au-delà de 2 reconductions
    consécutives (`reconduction_streak`).

**P2 — Communication (juin 2026)** — notifications in-app temps réel :

- Notifications : `GET /api/notifications` (paginé + compteur non-lus),
  `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all`.
  Cloche dans l'en-tête de tous les portails (badge non-lus, volet, marquage lu).
- Flux temps réel `GET /api/notifications/stream` (SSE). EventSource ne portant
  pas d'en-tête Authorization, l'authentification se fait via le cookie refresh
  (HttpOnly, same-origin). Interrogation courte côté serveur → fonctionne même
  quand la notification provient d'un autre process (jobs workers).
- Annonces `POST /api/notifications` (Admin / Bailleur) diffusées à tous ou à un
  rôle ; éclatées en une notification par destinataire (état lu/non-lu correct).
- Boîte à suggestions (§5.4) : `POST /api/suggestions` (tout utilisateur),
  `GET /api/suggestions` (Admin = toutes, Bailleur = visibles uniquement),
  `PATCH /api/suggestions/:id/read` (notifie l'auteur d'une « lecture »),
  `PATCH /api/suggestions/:id/visibility` (visibilité Bailleur),
  `GET /api/suggestions/mine`. Les auteurs ne voient jamais les destinataires.
- **Web Push (VAPID)** — §5.3 / §7.2 :
  - `GET /api/push/vapid` (clé publique), `POST /api/push/subscribe`,
    `POST /api/push/unsubscribe` (abonnement stocké dans `users.push_subscription`).
  - Bouton « Activer les notifications push » dans la cloche ; abonnement via le
    `PushManager` du navigateur, service worker `public/push-sw.js` (handlers
    `push` / `notificationclick`) injecté dans le SW next-pwa via `importScripts`.
  - Envoi best-effort respectant `notif_prefs.push`, purge des abonnements
    expirés (404/410). Câblé sur les annonces et la lecture des suggestions
    (apps/web) et sur les alertes d'échéance (jobs workers). Fire-and-forget :
    la livraison réseau ne bloque jamais la réponse API.
  - Clés VAPID dans `.env` (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
    `VAPID_SUBJECT`). Le service worker n'est actif qu'en build de production
    (désactivé en dev par next-pwa) ; la livraison réelle nécessite un contexte
    sécurisé (HTTPS ou `localhost`).

- **Événements** (§5.5) : `POST /api/evenements` (tout utilisateur propose),
  `GET /api/evenements` (statut visible par tous), `PATCH /api/evenements/:id/statut`
  (Admin approuve/rejette). Badge EN ATTENTE / APPROUVÉ / REJETÉ ; le créateur est
  notifié à chaque décision, une approbation est annoncée à toute la communauté.
- **Anniversaires** (§5.6) : opt-in via le profil (`birthday` + `birthday_public`).
  Job workers **anniversaires** (quotidien) : rappel **J-7** diffusé à tous les
  actifs (in-app + push), idempotent (dédup par titre + jour).
- **Profil & préférences** : `GET / PUT /api/users/:id/profile` (propriétaire ou
  Admin) — nom, contact, langue, opt-in anniversaire, canaux `notif_prefs`
  (push / SMS / email). Page Profil dans chaque portail.

**P3 — Sécurité & communauté (juin 2026)** :

- **Signal de détresse encadré** (§5.8 / §0.2) : `POST /api/distress` (5 clics
  rapides côté UI + géoloc opt-in), diffusé en temps réel à tous les actifs
  (in-app + push). Anti-abus **sans couper la sécurité** : au-delà du seuil
  (`DISTRESS_REVIEW_THRESHOLD`) le compte passe en `distress_review` et l'Admin
  est alerté — **le signal part toujours**, marqué « à vérifier ». Seul un ban
  manuel Admin (`PATCH /api/users/:id/distress-ban`, journalisé) bloque
  l'émission ; la réactivation lève la revue. `GET /api/distress` +
  `PATCH /api/distress/:id/resolve` pour le suivi (bouton 🚨 dans l'en-tête,
  page d'arbitrage Admin).
- **Tickets de maintenance** (§5.12) : `POST /api/tickets` (catégorie,
  description), `GET /api/tickets` (Admin = tous · autres = les siens),
  `PATCH /api/tickets/:id/statut` (Admin : ouvert → en cours → résolu, priorité,
  assignation). L'auteur est notifié à chaque changement de statut.

**P4 — Communauté + (juin 2026)** :

- **Sondages & votes** (§5.13) : `POST /api/sondages` (Admin : question +
  options), `GET /api/sondages` (résultats temps réel + mon vote),
  `POST /api/sondages/:id/vote` (un vote par utilisateur, modifiable tant que le
  sondage est ouvert), `PATCH /api/sondages/:id/close` (Admin).
- **Portfolio & annuaire** (§5.7 / §5.14) : `GET /api/portfolios/:id` (visible
  par tous), `GET / PUT /api/portfolios` (mon portfolio : bio, compétences,
  diplômes, réalisations, dispo aux recommandations), `GET /api/annuaire?skill=&dispo=1`
  (recherche par compétence/diplôme + filtre disponibilité).
- **Projet commun & cotisations** (§5.10) : `POST /api/projets` (Admin : titre,
  objectifs, besoins, contribution suggérée, rôles destinataires),
  `GET /api/projets` (filtré par rôle, barre de cagnotte collecté/objectif),
  `POST /api/projets/:id/contribuer`.

**P5 — Estimation & finitions (juin 2026)** :

- **Prédiction / estimation par type** (§5.11) : `POST /api/predictions` (Admin —
  `Montant = (I × P) + TVA + LC + T`), publiée à tous (notif `prediction`),
  `GET /api/predictions`, `PATCH /api/predictions/:id/reel` (montant réel →
  comparaison **estimé vs réel** avec écart). Réutilise `estimerCharge` (shared).
- **2FA TOTP admin** (§9) : TOTP RFC 6238 **maison, sans dépendance**
  ([lib/totp.ts](apps/web/lib/totp.ts)). `POST /api/auth/2fa/setup` (secret +
  URI `otpauth://`), `/verify` (active après code valide), `/disable`. Le login
  exige le code si le compte a un `totp_secret` (réponse `twoFactorRequired`,
  champ TOTP affiché). Panneau d'activation dans le profil Admin.
- **Durcissement** (§9) : en-têtes de sécurité globaux (CSP, `X-Frame-Options:
  DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS en prod) via `next.config.js`.
- **Export comptable CSV** : `GET /api/export/factures?mois=` (Admin / Bailleur),
  bouton « Export CSV » sur les listes de factures.

**Stockage objet & contenus média (juin 2026)** — infra d'upload self-host :

- **Backend S3-compatible (MinIO)** ajouté au `docker-compose.yml` (service
  `minio` + `minio-init` qui crée le bucket `campusgest` en lecture anonyme).
  Variables `S3_*` dans `.env` ; abstraction `lib/storage.ts` derrière une
  interface `StorageProvider` (driver choisi par `STORAGE_DRIVER`) — Cloudinary
  reste branchable plus tard sans toucher aux appelants (conception §6).
- **Téléversement** `POST /api/uploads` (multipart, authentifié) : validation
  genre `image` (JPEG/PNG/WebP) ou `document` (PDF/JPEG/PNG), taille ≤ 5 Mo,
  renvoie un chemin `/storage/<bucket>/<clé>` **relatif au domaine de l'app**
  (servi par Caddy en prod, par `app/storage/[...path]` en dev) : un changement
  de domaine n'invalide donc aucun fichier déjà publié, et la CSP se limite à
  `img-src 'self'`. Helper client `uploadFile()` (multipart + rotation refresh,
  pré-validation taille/type), `deleteUpload()` pour ramasser un objet
  téléversé qu'aucun enregistrement n'a fini par référencer.
  Rendu via `StoredImage` : image manquante ou illisible affichée comme telle
  plutôt qu'en cadre vide.
- **Fil d'infos / posts** (§5.9) : `POST /api/posts` (Admin / Bailleur, **image
  obligatoire**), `GET /api/posts` (tous ; posts masqués réservés Admin),
  `PATCH /api/posts/:id/hidden` (modération Admin). Diffusion in-app + push.
- **Documents partagés** (§5.15) : `POST /api/documents` (Admin, **fichier
  obligatoire**, catégorie + rôles destinataires), `GET /api/documents`
  (filtré par rôle ; Admin voit tout), `DELETE /api/documents/:id`.
- **Justificatifs de paiement** (§5.2) : champ d'upload dans le formulaire
  d'encaissement (Admin) ; lien « Voir justificatif » dans le détail facture.

**Finitions (juin 2026)** — confort d'usage :

- **Export PDF récapitulatif** : `GET /api/export/recap?mois=` (Admin / Bailleur)
  — relevé facturé vs encaissé + taux de recouvrement + détail des lignes.
  Générateur PDF maison étendu au **multi-pages automatique** (saut de page sous
  la marge) ; bouton « Export PDF » à côté de l'export CSV.
- **Mode sombre** : bascule clair/sombre dans l'en-tête (et sur l'écran de
  connexion), préférence mémorisée (`localStorage`), application avant rendu
  pour éviter le flash. Par défaut : préférence système.
- **Recherche & filtres** : recherche par nom/identifiant/e-mail + filtres
  rôle & statut sur les utilisateurs ; recherche + filtre catégorie sur les
  documents ; recherche locale sur le fil d'infos.

**UX & marque (juin 2026)** :

- **Marque KingCity** : logo couronne + wordmark (composant `Brand`), favicon
  SVG, titre d'onglet, métadonnées PWA, émetteur 2FA et en-têtes PDF.
- **Navigation pro & responsive** : barre supérieure *sticky* + **navigation
  latérale** regroupée par section (fixe en desktop, **tiroir hamburger** en
  mobile).
- **Toasts & confirmation** (`UiProvider`, `useToast`, `useConfirm`) :
  remplacent les `window.confirm` natifs (succès / erreur, modale *danger*).
- **Anniversaire sans année** : saisie jour + mois, **année facultative**
  (champ `birthday_year_hidden`) pour ne pas révéler son âge. Le rappel J-7
  n'utilise que le jour/mois.
- **Téléphone obligatoire** (`phoneSchema`) à la création de compte et au
  profil — joignabilité en cas de problème à la cité.
- **Photo de portfolio** (`photo_url`) téléversée vers le stockage objet,
  affichée en rond dans le portfolio et l'annuaire.
- **Mots de passe** : bascule afficher/masquer (`PasswordInput`) sur tous les
  champs ; validation longueur min. + correspondance mot de passe / confirmation.
- **SMS désactivé** : option visible mais grisée (canal indisponible).

**Reste (hors périmètre actuel)** : export Excel (.xlsx) ; canaux de livraison
SMS / e-mail (le push est en place).

## Décisions par défaut (à confirmer)

- Mono-bailleur pour l'instant (un seul compte rôle `bailleur`).
- Allemand (DE) conservé.
- Paiements Mobile Money saisis manuellement par l'Admin (pas d'API opérateur en P1).
