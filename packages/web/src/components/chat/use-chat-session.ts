"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBackend } from "@/components/machines/connection-context";
import {
  ApiError,
  api,
  type Conversation,
  type ConversationSummary,
  type Machine,
  type MessageMode,
  type Provider,
  type SessionSummary,
  type Workspace,
} from "@/lib/api";

type Submission = { text: string; requestId: string; whenBusy?: MessageMode };
export function useChatSession() {
  const { connections, id: machineId, select: selectMachine } = useBackend();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState("");
  const conversationRef = useRef("");
  const conversationAttempt = useRef<
    { name?: string; requestId: string } | undefined
  >(undefined);
  const [creating, setCreating] = useState(false);
  const creationInFlight = useRef(false);
  const focusNewConversation = useRef(false);
  const creationAttempt = useRef<{
    machineId: string;
    workspaceId: string;
    requestId: string;
  }>(undefined);
  const [machine, setMachine] = useState<Machine>();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState("");
  const selectedRef = useRef("");
  const epoch = useRef(0);
  const [snapshot, setSnapshot] = useState<Conversation>();
  const [online, setOnline] = useState(false);
  const [detailOnline, setDetailOnline] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [working, setWorking] = useState(false);
  const [sandboxDirty, setSandboxDirty] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [messageModes, setMessageModes] = useState<Record<string, MessageMode>>(
    {},
  );
  const [pending, setPending] = useState<
    Record<string, Submission | undefined>
  >({});
  const session =
    snapshot?.id === selected &&
    (!conversationId || snapshot.conversationId === conversationId)
      ? snapshot
      : undefined;
  const draftKey = session ? `${session.id}:${session.conversationId}` : "";
  const conversationPath = useCallback(
    (id: string, cid = conversationRef.current) =>
      `/sessions/${id}${cid ? `/conversations/${cid}` : ""}`,
    [],
  );
  const chooseConversation = useCallback((cid: string) => {
    conversationRef.current = cid;
    setConversationId(cid);
    setSandboxDirty(false);
    setDetailOnline(false);
    setDetailError("");
    const url = new URL(window.location.href);
    url.searchParams.set("conversation", cid);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  const select = useCallback((id: string) => {
    conversationAttempt.current = undefined;
    conversationRef.current = "";
    setConversationId("");
    setConversations([]);
    selectedRef.current = id;
    setSelected(id);
    setSandboxDirty(false);
    setError("");
    setDetailOnline(false);
    setDetailError("");
    const url = new URL(window.location.href);
    url.searchParams.set("session", id);
    for (const key of ["conversation", "workspace", "new"])
      url.searchParams.delete(key);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  useEffect(() => {
    if (!creating || !online || creationInFlight.current) return;
    creationInFlight.current = true;
    const previous = creationAttempt.current;
    const input =
      previous?.machineId === machineId && previous.workspaceId === workspaceId
        ? previous
        : { machineId, workspaceId, requestId: crypto.randomUUID() };
    creationAttempt.current = input;
    setWorking(true);
    setError("");
    void (async () => {
      try {
        const created = await api<Conversation>(
          "/sessions",
          "POST",
          {
            requestId: input.requestId,
            workspaceId: input.workspaceId || undefined,
            access: "project",
          },
          undefined,
          input.machineId,
        );
        creationAttempt.current = undefined;
        ++epoch.current;
        focusNewConversation.current = true;
        select(created.id);
        setSnapshot(created);
        setDetailOnline(true);
        setDetailError("");
        window.dispatchEvent(new Event("console:tree-changed"));
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        creationInFlight.current = false;
        setCreating(false);
        setWorking(false);
      }
    })();
  }, [creating, online, machineId, workspaceId, select]);

  useEffect(() => {
    if (focusNewConversation.current && session) {
      document.getElementById("message")?.focus({ preventScroll: true });
      focusNewConversation.current = false;
    }
  }, [session]);

  useEffect(() => {
    const deleted = (event: Event) => {
      const { path, machineId } = (
        event as CustomEvent<{ path: string; machineId: string }>
      ).detail;
      if (
        machineId === (sessionStorage.getItem("console.backend") || "local") &&
        path ===
          `/sessions/${selectedRef.current}/conversations/${conversationRef.current}`
      )
        chooseConversation("");
    };
    window.addEventListener("console:tree-deleted", deleted);
    return () => window.removeEventListener("console:tree-deleted", deleted);
  }, [chooseConversation]);
  useEffect(() => {
    const open = () => setCreating(true);
    setWorkspaceId(
      new URLSearchParams(window.location.search).get("workspace") ?? "",
    );
    window.addEventListener("console:new-session", open);
    if (new URLSearchParams(window.location.search).has("new"))
      setCreating(true);
    return () => window.removeEventListener("console:new-session", open);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let initial = true;
    async function poll() {
      try {
        const [projects, machines, items, connected] = await Promise.all([
          api<Workspace[]>("/workspaces", "GET", undefined, controller.signal),
          api<Machine[]>("/machines", "GET", undefined, controller.signal),
          api<SessionSummary[]>(
            "/sessions",
            "GET",
            undefined,
            controller.signal,
          ),
          api<Provider[]>(
            "/providers?connected=true",
            "GET",
            undefined,
            controller.signal,
          ),
        ]);
        if (controller.signal.aborted) return;
        setWorkspaces(projects);
        setMachine(machines[0]);
        setProviders(connected);
        setConnectionError("");
        setOnline(true);
        if (
          selectedRef.current &&
          !items.some((item) => item.id === selectedRef.current)
        )
          select(items[0]?.id ?? "");
        if (initial) {
          initial = false;
          const id =
            new URL(window.location.href).searchParams.get("session") ||
            items[0]?.id;
          if (id && !selectedRef.current) {
            const cid = new URL(window.location.href).searchParams.get(
              "conversation",
            );
            select(id);
            if (cid) chooseConversation(cid);
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setOnline(false);
          setConnectionError((cause as Error).message);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [select, chooseConversation]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const started = epoch.current;
      try {
        const current = await api<Conversation>(
          conversationPath(encodeURIComponent(selected), conversationId),
          "GET",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted && started === epoch.current) {
          setSnapshot(current);
          setDetailOnline(true);
          setDetailError("");
          const rows = await api<ConversationSummary[]>(
            `/sessions/${selected}/conversations`,
            "GET",
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted && started === epoch.current) {
            setConversations(rows);
            if (
              conversationRef.current &&
              !rows.some((row) => row.id === conversationRef.current)
            )
              chooseConversation(rows[0]?.id ?? "");
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted && started === epoch.current) {
          setDetailOnline(false);
          setDetailError((cause as Error).message);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selected, conversationId, conversationPath, chooseConversation]);

  async function operate(id: string, action: () => Promise<void>) {
    const cid = conversationRef.current;
    ++epoch.current;
    setWorking(true);
    setError("");
    try {
      await action();
      const current = await api<Conversation>(conversationPath(id, cid));
      ++epoch.current;
      if (selectedRef.current === id && conversationRef.current === cid) {
        setSnapshot(current);
        setDetailOnline(true);
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      ++epoch.current;
      setWorking(false);
    }
  }
  async function newAgent() {
    if (!session) return;
    const input = conversationAttempt.current ?? {
      requestId: crypto.randomUUID(),
    };
    conversationAttempt.current = input;
    await operate(session.id, async () => {
      const row = await api<ConversationSummary>(
        `/sessions/${session.id}/conversations`,
        "POST",
        input,
      );
      conversationAttempt.current = undefined;
      chooseConversation(row.id);
    });
  }
  const forkAttempt = useRef<
    { entryId: string; requestId: string } | undefined
  >(undefined);
  async function fork(entryId: string) {
    if (!session) return;
    const input =
      forkAttempt.current?.entryId === entryId
        ? forkAttempt.current
        : { entryId, requestId: crypto.randomUUID() };
    forkAttempt.current = input;
    await operate(session.id, async () => {
      const row = await api<ConversationSummary>(
        `${conversationPath(session.id)}/fork`,
        "POST",
        input,
      );
      forkAttempt.current = undefined;
      chooseConversation(row.id);
    });
  }
  async function send(mode?: MessageMode) {
    if (!session || working) return;
    const id = session.id;
    const key = `${id}:${session.conversationId}`;
    const input = pending[key] ?? {
      text: drafts[key] ?? "",
      requestId: crypto.randomUUID(),
      ...(session.queue === undefined
        ? {}
        : { whenBusy: mode ?? messageModes[key] ?? "steer" }),
    };
    setPending((items) => ({ ...items, [key]: input }));
    await operate(id, async () => {
      try {
        await api(
          `${conversationPath(id, session.conversationId)}/messages`,
          "POST",
          input,
        );
      } catch (cause) {
        if (
          cause instanceof ApiError &&
          [400, 403, 404, 409, 413, 415].includes(cause.status)
        )
          setPending((items) => ({ ...items, [key]: undefined }));
        throw cause;
      }
      setPending((items) => ({ ...items, [key]: undefined }));
      setDrafts((items) => ({
        ...items,
        [key]: items[key] === input.text ? "" : (items[key] ?? ""),
      }));
    });
  }
  const selectedConversation = conversations.find(
    (item) => item.id === session?.conversationId,
  );
  const parentConversation = conversations.find(
    (item) => item.id === selectedConversation?.parentId,
  );
  const parentName =
    parentConversation?.name === "Main"
      ? session?.name
      : parentConversation?.name;
  const relationship =
    selectedConversation?.kind === "fork" ? "Forked from" : "Delegated by";

  return {
    connections,
    machineId,
    selectMachine,
    workspaces,
    workspaceId,
    setWorkspaceId,
    conversations,
    setConversations,
    conversationId,
    chooseConversation,
    creating,
    setCreating,
    machine,
    providers,
    selected,
    select,
    session,
    online,
    detailOnline,
    error,
    connectionError,
    detailError,
    working,
    setWorking,
    setSnapshot,
    sandboxDirty,
    setSandboxDirty,
    drafts,
    setDrafts,
    messageModes,
    setMessageModes,
    pending,
    draftKey,
    conversationPath,
    operate,
    newAgent,
    fork,
    send,
    agentName:
      selectedConversation?.name === "Main"
        ? session?.name
        : selectedConversation?.name,
    parentName,
    relationship,
  };
}
export type ChatSession = ReturnType<typeof useChatSession>;
