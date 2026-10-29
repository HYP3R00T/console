"use client";
import { createContext, useContext } from "react";
import type { BackendConnection } from "@/lib/api";
export const BackendContext = createContext({
  id: "",
  connections: [] as BackendConnection[],
  select: (_id: string) => {},
});
export const useBackend = () => useContext(BackendContext);
