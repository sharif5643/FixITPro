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

  async headers() {
    // Next.js App Router requires 'unsafe-inline' + 'unsafe-eval' for hydration scripts
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',              value: 'DENY' },
          { key: 'X-Content-Type-Options',        value: 'nosniff' },
          { key: 'Referrer-Policy',               value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',            value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security',     value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy',       value: csp },
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
