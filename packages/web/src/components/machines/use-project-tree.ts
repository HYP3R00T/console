"use client";
import { useEffect, useState } from "react";
import { loadProjectTree } from "@/lib/navigation";
import { startPolling } from "@/lib/poll";
export function useProjectTree(machineId: string) {
  const [data, setData] =
    useState<Awaited<ReturnType<typeof loadProjectTree>>>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = () => {
    setRevision((value) => value + 1);
    window.dispatchEvent(new Event("console:tree-changed"));
  };
  useEffect(() => {
    void revision; // Re-fetch immediately after a tree mutation.
    return startPolling({
      read: (signal) => loadProjectTree(machineId, signal),
      onValue: (value) => {
        setData(value);
        setError("");
      },
      onError: () => setError("Offline · saved information may be stale"),
      interval: 3000,
    });
  }, [machineId, revision]);
  return { data, error, refresh };
}
