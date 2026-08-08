export { cn } from "@/utils";

export function truncateAddress(address, start = 6, end = 4) {
  if (!address) return "";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}…${address.slice(-end)}`;
}

export function formatPrice(value, currency = "USDC") {
  const amount = Number(value) || 0;
  return `$${amount.toFixed(2)} ${currency}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
