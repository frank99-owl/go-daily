export function isAuthSessionMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { name?: unknown; message?: unknown };
  return maybe.name === "AuthSessionMissingError" || maybe.message === "Auth session missing!";
}
