"use client";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useConnection } from "@/components/connection-provider";
import {
  clientConfiguration,
  subscribeConfiguration,
} from "@/lib/configuration/store";
import {
  conversationPinsKey,
  parseConversationPins,
} from "@/lib/conversation-pins";
import { type ProjectPins, updateProjectPins } from "@/lib/project-pins";

const Context = createContext<{
  pins: ProjectPins;
  ready: boolean;
  error?: string;
  setPin: (origin: string, key: string, value: boolean) => void;
} | null>(null);
export function ConversationPreferences({ children }: { children: ReactNode }) {
  const [pins, setPins] = useState<ProjectPins>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    try {
      setPins(
        parseConversationPins(
          clientConfiguration().getItem(conversationPinsKey),
        ),
      );
    } catch {
      setError(
        "Conversation pins could not be read. Existing storage has not been changed.",
      );
    }
    setReady(true);
  }, []);
  useEffect(
    () =>
      subscribeConfiguration(() => {
        try {
          setPins(
            parseConversationPins(
              clientConfiguration().getItem(conversationPinsKey),
            ),
          );
          setError(undefined);
        } catch {
          setError("Could not refresh conversation pins.");
        }
      }),
    [],
  );
  return (
    <Context
      value={{
        pins,
        ready,
        error,
        setPin: (origin, key, value) => {
          if (!ready || error)
            throw new Error(error ?? "Wait for conversation pins to load.");
          const next = updateProjectPins(pins, origin, key, value);
          clientConfiguration().setItem(
            conversationPinsKey,
            JSON.stringify(next),
          );
          setPins(next);
        },
      }}
    >
      {children}
    </Context>
  );
}
export function useConversationPins() {
  const state = useContext(Context);
  const { origin } = useConnection();
  if (!state) throw new Error("ConversationPreferences is required");
  return {
    pins: origin ? (state.pins[origin] ?? []) : [],
    error: state.error,
    ready: state.ready && !!origin,
    setPin: (key: string, value: boolean) => {
      if (!origin) throw new Error("Connect this machine first.");
      state.setPin(origin, key, value);
    },
  };
}
