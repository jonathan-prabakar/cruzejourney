import type { NextConfig } from 'next';

const config: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [{ source: '/journey', destination: '/', permanent: true }];
  },
};
export default config;
