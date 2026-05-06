import { create } from "zustand";
import type { User } from "@/types";

interface AuthStore {
  accessToken: string | null;
  user: User | null;
  isInitialized: boolean;

  setToken: (token: string) => void;
  setUser: (user: User) => void;
  clearToken: () => void;
  setInitialized: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  accessToken: null,
  user: null,
  isInitialized: false,

  setToken: (token) => set({ accessToken: token }),
  setUser: (user) => set({ user }),
  clearToken: () => set({ accessToken: null, user: null }),
  setInitialized: () => set({ isInitialized: true }),
}));
