/** @type {import('next').NextConfig} */
const useIsolatedDevDist =
  process.env.NODE_ENV === "development" && process.env.NEXT_DEV_ISOLATED === "1";

const nextConfig = {
  reactStrictMode: true,
  distDir: useIsolatedDevDist ? ".next-dev" : ".next",
  webpack(config) {
    config.module.rules.push({
      test: /\.md$/i,
      type: "asset/source"
    });
    return config;
  }
};

export default nextConfig;
