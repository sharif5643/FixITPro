/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  compress: true,

  // Skip ESLint during Docker/CI builds — lint runs separately in dev
  eslint: { ignoreDuringBuilds: true },

  images: {
    remotePatterns: [],
  },

  reactStrictMode: true,

  logging: {
    fetches: { fullUrl: false },
  },

  // RC2-002: Security headers for the Coolify/Traefik deployment (no Nginx layer).
  // HSTS is intentionally omitted — Traefik handles TLS termination and sets it there.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent the page from being embedded in iframes (clickjacking).
          { key: 'X-Frame-Options',       value: 'DENY' },
          // Prevent MIME-type sniffing.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Limit referrer information sent to third-party origins.
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          // Disable browser features not used by this app.
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
