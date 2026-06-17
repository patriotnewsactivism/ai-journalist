/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [],
  },
  images: {
    domains: ['api.dicebear.com', 'ui-avatars.com'],
  },
};

module.exports = nextConfig;
