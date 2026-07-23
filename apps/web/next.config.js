const path = require("path");
const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./i18n.ts");

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    skipWaiting: true,
    // Handlers Web Push (push / notificationclick) injectés dans le SW généré.
    importScripts: ["/push-sw.js"],
  },
});

const isDev = process.env.NODE_ENV !== "production";

// Origine du stockage objet (MinIO / S3) servant images & documents — dérivée
// de S3_PUBLIC_URL pour autoriser <img src> et les téléchargements via la CSP.
let storageOrigin = "";
try {
  if (process.env.S3_PUBLIC_URL) storageOrigin = new URL(process.env.S3_PUBLIC_URL).origin;
} catch {
  /* URL invalide : ignorée */
}

// CSP : 'unsafe-inline' requis par le bootstrap Next ; 'unsafe-eval' seulement
// en dev (React Refresh). Géoloc autorisée pour le signal de détresse.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://res.cloudinary.com${storageOrigin ? " " + storageOrigin : ""}`,
  "font-src 'self'",
  `connect-src 'self'${storageOrigin ? " " + storageOrigin : ""}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build autonome pour Docker : produit .next/standalone (serveur minimal +
  // node_modules tracés). Voir docs/DEPLOIEMENT.md §7.
  output: "standalone",
  // Racine du monorepo pour le file-tracing (sinon Next infère mal la racine
  // et n'embarque pas les workspaces packages/*). Sous `experimental` en Next 14
  // (passé au niveau racine seulement en Next 15).
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
  reactStrictMode: true,
  transpilePackages: ["@campusgest/shared", "@campusgest/db"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = withPWA(withNextIntl(nextConfig));
