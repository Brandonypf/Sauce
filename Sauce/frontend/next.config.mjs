/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
  webpack: (config, { webpack }) => {
    // Optional peer deps that wagmi/RainbowKit connectors reference but this app
    // never uses (x402 payments, React Native storage). Without ignoring them,
    // `next build` fails on unresolved imports.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@x402(\/|$)|@react-native-async-storage\/async-storage$)/,
      }),
    );
    // Node-only optional deps of WalletConnect that must not enter the browser bundle.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
