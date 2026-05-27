export function isAdmin(userId: string | undefined | null): boolean {
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim());
  return !!userId && adminIds.includes(userId);
}
