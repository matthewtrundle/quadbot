import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@quadbot/shared', '@quadbot/db'],
};

export default nextConfig;
