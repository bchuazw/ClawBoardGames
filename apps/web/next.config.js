/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Three.js works better without strict mode
  transpilePackages: ['three'],
  async redirects() {
    return [
      { source: '/watch', destination: '/monopoly/watch', permanent: false },
      { source: '/watch/lobby/:gameId', destination: '/monopoly/watch/lobby/:gameId', permanent: false },
      { source: '/agents', destination: '/monopoly/agents', permanent: false },
      { source: '/history', destination: '/monopoly/history', permanent: false },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    // Use deterministic chunk/module IDs in dev to avoid stale chunk references (e.g. ./449.js)
    if (dev) {
      config.optimization = config.optimization || {};
      config.optimization.moduleIds = 'deterministic';
      config.optimization.chunkIds = 'deterministic';
    }
    return config;
  },
};

module.exports = nextConfig;
