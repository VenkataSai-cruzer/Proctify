import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Teacher {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  teacher: Teacher | null;
  serverUrl: string;
  labMode: "HOME" | "LAB_SERVER" | "LAB_CLIENT";
  setAuth: (token: string, teacher: Teacher) => void;
  setServerUrl: (url: string) => void;
  setLabMode: (mode: AuthState["labMode"]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      teacher: null,
      serverUrl: "http://localhost:3000",
      labMode: "HOME",
      setAuth: (token, teacher) => set({ token, teacher }),
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setLabMode: (labMode) => set({ labMode }),
      logout: () => set({ token: null, teacher: null }),
    }),
    {
      name: "secureassess-auth",
      partialize: (s) => ({ token: s.token, teacher: s.teacher, serverUrl: s.serverUrl, labMode: s.labMode }),
    }
  )
);
