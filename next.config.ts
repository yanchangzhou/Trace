import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // pdf.js / docx-preview ESM + Webpack: avoids "defineProperty on non-Object" and worker issues
  transpilePackages: ['pdfjs-dist', 'docx-preview', 'jszip'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
