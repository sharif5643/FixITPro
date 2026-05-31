/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  compress: true,

  images: {
    remotePatterns: [],
  },

  reactStrictMode: true,

  logging: {
    fetches: { fullUrl: false },
  },
}

module.exports = nextConfig