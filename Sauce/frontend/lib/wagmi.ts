"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "DEMO_SAUCE";
const rpcUrl = process.env.NEXT_PUBLIC_ARB_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";

export const wagmiConfig = getDefaultConfig({
  appName: "SAUCE",
  projectId,
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http(rpcUrl),
  },
  ssr: true,
});
