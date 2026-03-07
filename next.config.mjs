/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async redirects() {
    return [
      // Redirect old market routes to new consolidated pages
      {
        source: '/markets/macro',
        destination: '/macro',
        permanent: true,
      },
      {
        source: '/markets/regime',
        destination: '/macro',
        permanent: true,
      },
      {
        source: '/markets/sectors',
        destination: '/sectors#sectors',
        permanent: true,
      },
      {
        source: '/markets/themes',
        destination: '/sectors#themes',
        permanent: true,
      },
      {
        source: '/markets/gold',
        destination: '/sectors#gold',
        permanent: true,
      },
      {
        source: '/markets/btc',
        destination: '/sectors#crypto',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
