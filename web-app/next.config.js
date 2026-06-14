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
}

module.exports = nextConfig