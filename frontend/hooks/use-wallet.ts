"use client";

import { useAccount } from "wagmi";
import { truncateAddress } from "@/lib/utils";

export function useWallet() {
  const { address, isConnected, isConnecting } = useAccount();

  return {
    address,
    isConnected,
    isConnecting,
    truncatedAddress: address ? truncateAddress(address) : "",
  };
}
