import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatPrice(price: string | number) {
  const value = Number(price);
  if (value === 0) return "Free";
  return `S/ ${value.toFixed(2)}`;
}
