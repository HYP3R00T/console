"use client";
import { Cable, Pencil, Plus, Server, Terminal, Trash2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { InspectorCode } from "@/components/sessions/inspector-code";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useBackendRequest } from "@/hooks/use-backend-request";
import {
  type IntegrationConfiguration,
  type IntegrationEntry,
  type IntegrationKind,
  integrationRoot,
  parseIntegrationDraft,
  upsertIntegration,
} from "@/lib/integration-settings";
import { SettingsDisclosure, SettingsHeading } from "./settings-presentation";

type Snapshot = {
  revision: string;
  configuration: IntegrationConfiguration | null;
  invalid: boolean;
};
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
export function IntegrationSettings({ kind }: { kind: IntegrationKind }) {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { client, request } = useBackendRequest();
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <SettingsHeading
        title={kind === "mcp" ? "MCP servers" : "SSH workspaces"}
        icon={kind === "mcp" ? Cable : Terminal}
        description={
          kind === "mcp"
            ? "Connect tool servers running on this machine."
            : "Configure remote workspaces for conversation tools."
        }
        help={
          kind === "mcp"
            ? "This backend currently supports stdio servers, not HTTP/SSE. Commands and environment variables belong to the backend machine. Enable MCP tools in each conversation’s Tools panel."
            : "SSH keys and known-hosts files stay on the backend. Choose a saved workspace from a conversation’s Tools panel. Host verification remains required."
        }
      />
      <Separator />
      {client ? (
        <ConfigurationEditor
          key={`${deviceId}:${kind}`}
          kind={kind}
          request={request}
        />
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
  kind: IntegrationKind;
  request: ReturnType<typeof useBackendRequest>["request"];
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [edit, setEdit] = useState<{
    original?: string;
    entry: IntegrationEntry;
  }>();
  const path = `/v1/machine/configuration/${kind}`,
    root = integrationRoot(kind);
  const initial = snapshot
    ? JSON.stringify(snapshot.configuration ?? { [root]: {} }, null, 2)
    : "";
  const configuration = parseIntegrationDraft(text, kind);
  const dirty = text !== initial;
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    void request<Snapshot>(path, { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setSnapshot(next);
          setText(
            JSON.stringify(next.configuration ?? { [root]: {} }, null, 2),
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
  }, [path, request, root]);
  async function run(save: boolean) {
    if (busy || (save && (!snapshot || !configuration || edit))) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const next = await request<Snapshot>(
        path,
        save
          ? {
              method: "PUT",
              body: JSON.stringify({
                revision: snapshot?.revision,
                configuration,
              }),
            }
          : undefined,
      );
      setSnapshot(next);
      setText(JSON.stringify(next.configuration ?? { [root]: {} }, null, 2));
      setEdit(undefined);
      setMessage({
        text: save ? "Saved and reloaded." : "Loaded saved configuration.",
      });
    } catch (cause) {
      setMessage({
        error: true,
        text:
          cause instanceof Error
            ? cause.message
            : "Could not update configuration.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          {kind === "mcp" ? "Configured servers" : "Saved workspaces"}{" "}
          {configuration && (
            <span className="text-muted-foreground">
              ({Object.keys(configuration[root]).length})
            </span>
          )}
        </h2>
        <Button
          disabled={busy || !configuration || !!edit}
          onClick={() =>
            setEdit({
              entry:
                kind === "mcp"
                  ? { command: "", args: [], env: [] }
                  : { host: "", hostKeyAlias: "", knownHostsFile: "", cwd: "" },
            })
          }
        >
          <Plus data-icon="inline-start" />
          {kind === "mcp" ? "Add server" : "Add workspace"}
        </Button>
      </div>
      {!snapshot && !message && <p role="status">Loading configuration…</p>}
      {snapshot?.invalid && (
        <p role="alert" className="text-sm text-destructive">
          The saved file is malformed. Review and repair it in Advanced JSON.
        </p>
      )}
      <div
        className={
          configuration && Object.keys(configuration[root]).length > 0
            ? "grid items-start gap-6 xl:grid-cols-2"
            : "grid items-start gap-6"
        }
      >
        <div
          className={
            edit &&
            configuration &&
            Object.keys(configuration[root]).length === 0
              ? "hidden"
              : "flex min-w-0 flex-col gap-3"
          }
        >
          {configuration &&
            Object.entries(configuration[root]).length === 0 &&
            !edit && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {kind === "mcp" ? "No servers yet" : "No workspaces yet"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {kind === "mcp"
                    ? "Install a stdio MCP server on the backend, then add its command here."
                    : "Prepare SSH access on the backend, then add the remote host and workspace path."}
                </CardContent>
              </Card>
            )}
          {configuration &&
            Object.entries(configuration[root]).map(([name, entry]) => (
              <Card key={name}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="size-4 text-muted-foreground" />
                    {name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-start gap-3">
                  <p className="min-w-0 flex-1 wrap-anywhere font-mono text-xs text-muted-foreground">
                    {String(
                      kind === "mcp"
                        ? entry.command
                        : `${entry.user ? `${entry.user}@` : ""}${entry.host} · ${entry.cwd}`,
                    )}
                  </p>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${name}`}
                    disabled={busy || !!edit}
                    onClick={() => setEdit({ original: name, entry })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${name} from draft`}
                    disabled={busy || !!edit}
                    onClick={() =>
                      setText(
                        JSON.stringify(
                          {
                            [root]: Object.fromEntries(
                              Object.entries(configuration[root]).filter(
                                ([key]) => key !== name,
                              ),
                            ),
                          },
                          null,
                          2,
                        ),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </CardContent>
              </Card>
            ))}
        </div>
        {edit && configuration && (
          <IntegrationForm
            key={edit.original ?? "new"}
            kind={kind}
            original={edit.original}
            initial={edit.entry}
            onCancel={() => setEdit(undefined)}
            onApply={(name, entry) => {
              setText(
                JSON.stringify(
                  upsertIntegration(
                    configuration,
                    kind,
                    name,
                    entry,
                    edit.original,
                  ),
                  null,
                  2,
                ),
              );
              setEdit(undefined);
              setMessage(undefined);
            }}
          />
        )}
      </div>
      <SettingsDisclosure title="Setup guide & example">
        <p className="text-sm text-muted-foreground">
          {kind === "mcp"
            ? "Use an absolute executable path on the backend. Add each argument separately, without shell quoting. Environment entries are names of existing backend variables, never secret values. After saving, enable MCP in the conversation’s Tools panel."
            : "Host is the SSH hostname; Host key alias identifies its trusted key in the backend’s known-hosts file. Workspace directory is an absolute POSIX path on the remote host. Verify and provision the host key and any private key on the backend before connecting. Save here, then choose the workspace in the conversation’s Tools panel."}
        </p>
        <InspectorCode
          language="json"
          label="Configuration example"
          code={JSON.stringify(examples[kind], null, 2)}
        />
      </SettingsDisclosure>
      <SettingsDisclosure title="Advanced JSON">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={id}>Configuration JSON</FieldLabel>
            <Textarea
              id={id}
              className="font-mono"
              rows={12}
              maxLength={65536}
              value={text}
              disabled={busy || !!edit}
              aria-invalid={!!snapshot && !configuration}
              onChange={(e) => setText(e.target.value)}
            />
            <FieldDescription>
              Changes remain a draft until saved. Backend validation is
              authoritative.
            </FieldDescription>
          </Field>
        </FieldGroup>
        {snapshot && !configuration && (
          <p role="alert" className="text-sm text-destructive">
            Enter an object containing {root}.
          </p>
        )}
      </SettingsDisclosure>
      <Separator />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={
            busy ||
            !snapshot ||
            !configuration ||
            !!edit ||
            (!dirty && !snapshot.invalid)
          }
          onClick={() => void run(true)}
        >
          {busy ? "Working…" : "Save and reload"}
        </Button>
        <Button
          variant="outline"
          disabled={busy || (!snapshot && !message)}
          onClick={() => void run(false)}
        >
          {dirty || edit ? "Discard changes" : "Refresh"}
        </Button>
        {(dirty || edit) && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Saving reloads shared connections and can interrupt active calls.
      </p>
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-sm text-destructive" : "text-sm"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
function IntegrationForm({
  kind,
  original,
  initial,
  onApply,
  onCancel,
}: {
  kind: IntegrationKind;
  original?: string;
  initial: IntegrationEntry;
  onApply: (name: string, entry: IntegrationEntry) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(original ?? ""),
    [entry, setEntry] = useState(initial),
    [error, setError] = useState<string>();
  const id = useId();
  const fields =
    kind === "mcp"
      ? [["command", "Command", "/absolute/path/to/server"]]
      : [
          ["host", "Host", "build.example.org"],
          ["user", "User (optional)", "console"],
          ["port", "Port (optional)", "22"],
          ["cwd", "Workspace directory", "/srv/workspace"],
          ["hostKeyAlias", "Host key alias", "build-box"],
          [
            "knownHostsFile",
            "Known-hosts file on backend",
            "/absolute/path/to/known_hosts",
          ],
          [
            "identityFile",
            "Private key file on backend (optional)",
            "/absolute/path/to/key",
          ],
        ];
  return (
    <Card className="@container">
      <CardHeader>
        <CardTitle>
          {original
            ? `Edit ${original}`
            : kind === "mcp"
              ? "New MCP server"
              : "New SSH workspace"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              onApply(name, entry);
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Check the form.",
              );
            }
          }}
        >
          <FieldGroup className="grid gap-4 @lg:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
              <Input
                id={`${id}-name`}
                required
                pattern="[a-z][a-z0-9-]{0,23}"
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-server"
              />
              <FieldDescription>
                Lowercase letters, digits and hyphens; start with a letter.
              </FieldDescription>
            </Field>
            {fields.map(([key, label, placeholder]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
                <Input
                  id={`${id}-${key}`}
                  value={
                    typeof entry[key] === "string" ||
                    typeof entry[key] === "number"
                      ? String(entry[key])
                      : ""
                  }
                  required={
                    kind === "mcp" ||
                    ["host", "hostKeyAlias", "knownHostsFile", "cwd"].includes(
                      key,
                    )
                  }
                  type={key === "port" ? "number" : "text"}
                  min={key === "port" ? 1 : undefined}
                  max={key === "port" ? 65535 : undefined}
                  placeholder={placeholder}
                  onChange={(e) => {
                    const next = { ...entry };
                    if (
                      !e.target.value &&
                      ["port", "user", "identityFile"].includes(key)
                    )
                      delete next[key];
                    else
                      next[key] =
                        key === "port"
                          ? Number(e.target.value)
                          : e.target.value;
                    setEntry(next);
                  }}
                />
              </Field>
            ))}
          </FieldGroup>
          {kind === "mcp" && (
            <>
              <StringList
                label="Arguments"
                values={Array.isArray(entry.args) ? entry.args : []}
                onChange={(args) => setEntry({ ...entry, args })}
              />
              <StringList
                label="Environment variable names"
                values={Array.isArray(entry.env) ? entry.env : []}
                onChange={(env) => setEntry({ ...entry, env })}
              />
              <Field orientation="horizontal">
                <Checkbox
                  id={`${id}-all-tools`}
                  checked={entry.tools === undefined}
                  onCheckedChange={(checked) => {
                    const next = { ...entry };
                    if (checked) delete next.tools;
                    else next.tools = [];
                    setEntry(next);
                  }}
                />
                <FieldLabel htmlFor={`${id}-all-tools`}>
                  Allow all server tools
                </FieldLabel>
              </Field>
              {entry.tools !== undefined && (
                <StringList
                  label="Allowed tools"
                  values={Array.isArray(entry.tools) ? entry.tools : []}
                  onChange={(tools) => setEntry({ ...entry, tools })}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Environment names reference variables on the backend. An empty
                allowed-tools list disables every tool.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit">Apply to draft</Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
function StringList({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>{label}</FieldLabel>
        {values.map((value, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Controlled list inputs intentionally retain positional focus while their values change.
          <div className="flex gap-2" key={`${label}-${index}`}>
            <Input
              aria-label={`${label} ${index + 1}`}
              value={value}
              onChange={(e) =>
                onChange(
                  values.map((item, i) =>
                    i === index ? e.target.value : item,
                  ),
                )
              }
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange([...values, ""])}
        >
          <Plus data-icon="inline-start" />
          Add{" "}
          {label === "Arguments"
            ? "argument"
            : label === "Allowed tools"
              ? "tool"
              : "variable"}
        </Button>
      </Field>
    </FieldGroup>
  );
}
