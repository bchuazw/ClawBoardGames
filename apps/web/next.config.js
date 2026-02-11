/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Three.js works better without strict mode
  transpilePackages: ['three'],
};

module.exports = nextConfig;
