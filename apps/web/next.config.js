const path = require("path");
const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./i18n.ts");

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // Page served when a navigation fails for lack of network.
  fallbacks: { document: "/offline.html" },
  // Our entries come before the defaults; those sharing a `cacheName`
  // (here "apis") replace the default one.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    skipWaiting: true,
    // Web Push handlers (push / notificationclick) injected into the generated SW.
    importScripts: ["/push-sw.js"],
    runtimeCaching: [
      {
        // /api/* responses are authenticated and user-specific.
        // next-pwa's default cache (NetworkFirst, 24 h) would serve them to the next
        // account on a shared device, and would buffer the SSE stream of
        // /api/notifications/stream, which never ends.
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        options: { cacheName: "apis" },
      },
    ],
  },
});

const isDev = process.env.NODE_ENV !== "production";

// Legacy object-storage origin. Stored assets are now addressed by an
// origin-relative /storage path, which `'self'` already covers; this only keeps
// allowing rows written as absolute URLs before that change. Empty by default.
let storageOrigin = "";
try {
  if (process.env.S3_PUBLIC_URL) storageOrigin = new URL(process.env.S3_PUBLIC_URL).origin;
} catch {
  /* invalid URL: ignored */
}

// CSP: 'unsafe-inline' is required by the Next bootstrap; 'unsafe-eval' only
// in dev (React Refresh). Geolocation allowed for the distress signal.
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
  // Standalone build for Docker: produces .next/standalone (minimal server +
  // traced node_modules). See docs/DEPLOIEMENT.md §7.
  output: "standalone",
  // Monorepo root for file tracing (otherwise Next infers the wrong root and
  // leaves out the packages/* workspaces). Under `experimental` in Next 14
  // (moved to the top level only in Next 15).
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
