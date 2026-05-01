"use client";

import { createContext } from "react";

export const AdminContext = createContext<boolean>(false);

export function AdminProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  return <AdminContext.Provider value={isAdmin}>{children}</AdminContext.Provider>;
}
