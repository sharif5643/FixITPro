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
          { key: 'X-Frame-Options',       value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
      {
        // Allow /print/* to be embedded in same-origin iframe (APK WebView receipt preview)
        source: '/print/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
