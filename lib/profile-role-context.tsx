"use client";

import { createContext, useContext, type ReactNode } from "react";

const ProfileRoleContext = createContext<string | null>(null);

export function ProfileRoleProvider({ role, children }: { role: string | null; children: ReactNode }) {
  return <ProfileRoleContext.Provider value={role}>{children}</ProfileRoleContext.Provider>;
}

export function useProfileRole() {
  return useContext(ProfileRoleContext);
}