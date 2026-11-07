"use client";
import { useParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useBackendRequest } from "@/hooks/use-backend-request";

type Snapshot = {
  revision: string;
  configuration: Record<string, unknown> | null;
  invalid: boolean;
};
type Request = ReturnType<typeof useBackendRequest>["request"];
const defaults = { mcp: { servers: {} }, ssh: { profiles: {} } };
const examples = {
  mcp: {
    servers: {
      example: {
        command: "/absolute/path/to/mcp-server",
        args: ["--stdio"],
        env: ["EXAMPLE_TOKEN"],
        tools: ["lookup"],
      },
    },
  },
  ssh: {
    profiles: {
      "build-box": {
        host: "build.example.org",
        user: "console",
        hostKeyAlias: "console-build-box",
        knownHostsFile: "/absolute/path/to/known-hosts",
        cwd: "/srv/workspace",
      },
    },
  },
};
export function IntegrationSettings() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { client, request } = useBackendRequest();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">MCP and SSH</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configure this machine’s tool servers and remote workspaces. Saving
          reloads shared connections and may interrupt active calls in any chat.
        </p>
      </header>
      {client ? (
        <div key={deviceId} className="flex flex-col gap-6">
          <ConfigurationEditor kind="mcp" request={request} />
          <ConfigurationEditor kind="ssh" request={request} />
        </div>
      ) : (
        <p>Connect this machine from Manage devices.</p>
      )}
    </div>
  );
}
function ConfigurationEditor({
  kind,
  request,
}: {
  kind: "mcp" | "ssh";
  request: Request;
}) {
  const id = useId();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const path = `/v1/machine/configuration/${kind}`;
  const label = kind === "mcp" ? "MCP servers" : "SSH profiles";
  const initial = snapshot
    ? JSON.stringify(snapshot.configuration ?? defaults[kind], null, 2)
    : "";
  let configuration: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      configuration = parsed as Record<string, unknown>;
  } catch {
    /* Validation is displayed below the editor. */
  }
  const invalid = !!snapshot && !configuration;
  useEffect(() => {
    const controller = new AbortController();
    void request<Snapshot>(path, { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setSnapshot(next);
          setText(
            JSON.stringify(next.configuration ?? defaults[kind], null, 2),
          );
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setMessage({
            error: true,
            text:
              cause instanceof Error
                ? cause.message
                : "Could not load configuration.",
          });
      });
    return () => controller.abort();
  }, [kind, path, request]);
  async function reload() {
    if (busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const next = await request<Snapshot>(path);
      setSnapshot(next);
      setText(JSON.stringify(next.configuration ?? defaults[kind], null, 2));
    } catch (cause) {
      setMessage({
        error: true,
        text:
          cause instanceof Error
            ? cause.message
            : "Could not load configuration.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (busy || !snapshot || !configuration) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const next = await request<Snapshot>(path, {
        method: "PUT",
        body: JSON.stringify({ revision: snapshot.revision, configuration }),
      });
      setSnapshot(next);
      setText(JSON.stringify(next.configuration ?? defaults[kind], null, 2));
      setMessage({
        text: "Saved and reloaded. Check connection status in the conversation’s Tools panel.",
      });
    } catch (cause) {
      setMessage({
        error: true,
        text:
          cause instanceof Error
            ? cause.message
            : "Could not save configuration.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>
          {kind === "mcp"
            ? "Up to eight servers. Commands use absolute paths on this backend. Environment entries name existing variables; their values are never loaded into this editor."
            : "Up to sixteen POSIX workspaces. Paths to identity and known-hosts files refer to this backend; key contents are never loaded into this editor."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {snapshot?.invalid && (
          <p role="alert">
            The existing file is malformed. Its contents are not displayed.
            Enter a valid replacement to repair it.
          </p>
        )}
        {!snapshot && !message && <p role="status">Loading configuration…</p>}
        {snapshot && (
          <FieldGroup>
            <Field data-invalid={invalid}>
              <FieldLabel htmlFor={id}>{label} JSON</FieldLabel>
              <Textarea
                id={id}
                value={text}
                rows={14}
                maxLength={65536}
                disabled={busy}
                aria-invalid={invalid}
                onChange={(event) => {
                  setText(event.target.value);
                  setMessage(undefined);
                }}
              />
              <FieldDescription>
                {kind === "mcp"
                  ? "Use a servers object. Each entry requires command; args, env and tools are optional string arrays. An empty tools array permits no tools; omitting it permits the server’s catalog."
                  : "Use a profiles object. Each entry requires host, hostKeyAlias, knownHostsFile and cwd; user, port and identityFile are optional."}{" "}
                Names use lowercase letters, digits and hyphens, starting with a
                letter. Empty objects remove all entries.
              </FieldDescription>
              {invalid && <FieldError>Enter a valid JSON object.</FieldError>}
            </Field>
          </FieldGroup>
        )}
        <details>
          <summary>Configuration example</summary>
          <pre className="overflow-x-auto text-xs">
            {JSON.stringify(examples[kind], null, 2)}
          </pre>
        </details>
        {message && (
          <p role={message.error ? "alert" : "status"}>{message.text}</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          disabled={
            busy ||
            !snapshot ||
            invalid ||
            (text === initial && !snapshot.invalid)
          }
          onClick={() => void save()}
        >
          {busy ? "Working…" : "Save and reload"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void reload()}>
          {snapshot ? "Reload and discard edits" : "Retry loading"}
        </Button>
      </CardFooter>
    </Card>
  );
}
