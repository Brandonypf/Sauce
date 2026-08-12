export function authReturnTo(path) {
  return `returnTo=${encodeURIComponent(path || "/")}`;
}

export function readReturnTo(search) {
  const params = new URLSearchParams(search);
  const value = params.get("returnTo");
  return value && value.startsWith("/") ? value : "/";
}
