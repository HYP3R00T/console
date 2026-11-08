"use client";

import { PackagePlus, Puzzle, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { InspectorCode } from "@/components/sessions/inspector-code";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useBackendRequest } from "@/hooks/use-backend-request";
import { SettingsDisclosure, SettingsHeading } from "./settings-presentation";

type Selection = { name: string; module: string; sha256: string };
type Snapshot = {
  revision: string;
  configuration: { extensions: Selection[] } | null;
  invalid: boolean;
  problem?: string;
  installed: (Selection & {
    tools: string[];
    tasks: { name: string; version: number }[];
  })[];
};
type Candidates = {
  modules: { module: string; sha256?: string; unavailable?: boolean }[];
  problem?: string;
  truncated?: boolean;
};
const path = "/v1/machine/configuration/extensions";
export function ExtensionSettings() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { client, request } = useBackendRequest();
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <SettingsHeading
        title="Extensions"
        icon={Puzzle}
        description="Add tools and hooks from trusted bundles."
        help="Installation makes definitions available. Select tools and hooks separately in each conversation. Removal preserves saved tasks; restore compatible code to recover blocked work."
      />
      <Separator />
      {client ? (
        <ExtensionEditor key={deviceId} request={request} />
      ) : (
        <p>Connect this machine from Manage devices.</p>
      )}
    </div>
  );
}
function ExtensionEditor({
  request,
}: {
  request: ReturnType<typeof useBackendRequest>["request"];
}) {
  const id = useId();
  const [names, setNames] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [candidates, setCandidates] = useState<Candidates>();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  let configuration: { extensions: Selection[] } | undefined;
  try {
    const value = JSON.parse(text);
    if (
      value &&
      Array.isArray(value.extensions) &&
      value.extensions.every(
        (entry: unknown) =>
          entry &&
          typeof entry === "object" &&
          "name" in entry &&
          typeof entry.name === "string" &&
          "module" in entry &&
          typeof entry.module === "string" &&
          "sha256" in entry &&
          typeof entry.sha256 === "string",
      )
    )
      configuration = value;
  } catch {}
  const invalid = !!snapshot && !configuration;
  const initial = JSON.stringify(
    snapshot?.configuration ?? { extensions: [] },
    null,
    2,
  );
  const adopt = useCallback((value: Snapshot) => {
    setSnapshot(value);
    setText(JSON.stringify(value.configuration ?? { extensions: [] }, null, 2));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      request<Snapshot>(path, { signal: controller.signal }),
      request<Candidates>("/v1/machine/extensions/candidates", {
        signal: controller.signal,
      }),
    ])
      .then(([current, available]) => {
        if (!controller.signal.aborted) {
          adopt(current);
          setCandidates(available);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setMessage({
            error: true,
            text:
              cause instanceof Error
                ? cause.message
                : "Could not load extensions.",
          });
      });
    return () => controller.abort();
  }, [request, adopt]);
  async function run(action: "save" | "refresh" | "reload") {
    if (busy || (action === "save" && (!snapshot || !configuration))) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const current =
        action === "save" && snapshot && configuration
          ? await request<Snapshot>(path, {
              method: "PUT",
              body: JSON.stringify({
                revision: snapshot.revision,
                configuration,
              }),
            })
          : action === "reload"
            ? await request<Snapshot>("/v1/machine/extensions/reload", {
                method: "POST",
                body: "{}",
              })
            : await request<Snapshot>(path);
      adopt(current);
      setCandidates(
        await request<Candidates>("/v1/machine/extensions/candidates"),
      );
      setMessage({
        text:
          action === "save"
            ? "Saved and activated. Existing calls finish on their original code."
            : action === "reload"
              ? "Reloaded saved definitions. Compatible blocked tasks can resume."
              : "Loaded current configuration and available bundles.",
      });
    } catch (cause) {
      setMessage({
        error: true,
        text:
          cause instanceof Error
            ? cause.message
            : "Could not update extensions.",
      });
    } finally {
      setBusy(false);
    }
  }
  function addBundleToDraft(module: string, sha256: string) {
    if (!configuration) return;
    const existing = configuration.extensions.find(
      (entry) => entry.module === module,
    );
    const entry = {
      name: names[module] ?? existing?.name ?? `user.${module.slice(0, -4)}`,
      module,
      sha256,
    };
    if (!/^user\.[a-z][a-z0-9-]{0,63}$/.test(entry.name)) {
      setMessage({
        error: true,
        text: "Use the bundle’s exported user.* name.",
      });
      return;
    }
    if (
      configuration.extensions.some(
        (item) => item.name === entry.name && item.module !== module,
      )
    ) {
      setMessage({
        error: true,
        text: "That extension name is already assigned to another bundle. Remove it from the draft first to replace it.",
      });
      return;
    }
    setText(
      JSON.stringify(
        {
          extensions: [
            ...configuration.extensions.filter(
              (item) => item.module !== module,
            ),
            entry,
          ],
        },
        null,
        2,
      ),
    );
    setMessage({
      text: "Bundle added to the draft. Check its exported extension name before saving.",
    });
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Only install code you trust. Bundles run with this backend user’s full
        privileges; Save and activate executes their factories.
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackagePlus className="size-4" />
              Available bundles
            </CardTitle>
            <CardDescription>
              Enter the exported name, then add a bundle to your draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!snapshot && !message && <p role="status">Loading extensions…</p>}
            {candidates?.problem && <p role="alert">{candidates.problem}</p>}
            {candidates?.truncated && (
              <p className="text-muted-foreground">
                Showing the first 128 filenames.
              </p>
            )}
            {candidates?.modules.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No bundles found. Open the setup guide below to provision an
                extension.
              </p>
            )}
            {candidates?.modules.map((bundle) => (
              <div key={bundle.module} className="flex flex-col gap-3">
                <p className="font-mono text-xs wrap-anywhere">
                  {bundle.module}
                </p>
                {bundle.sha256 ? (
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor={`${id}-${bundle.module}`}>
                        Exported extension name
                      </FieldLabel>
                      <Input
                        id={`${id}-${bundle.module}`}
                        disabled={busy}
                        value={
                          names[bundle.module] ??
                          configuration?.extensions.find(
                            (item) => item.module === bundle.module,
                          )?.name ??
                          `user.${bundle.module.slice(0, -4)}`
                        }
                        onChange={(e) =>
                          setNames({
                            ...names,
                            [bundle.module]: e.target.value,
                          })
                        }
                      />
                      <FieldDescription>
                        Must match the bundle’s user.* identity.
                      </FieldDescription>
                    </Field>
                    <Button
                      className="self-start"
                      variant="outline"
                      disabled={busy || !configuration}
                      onClick={() => {
                        if (bundle.sha256)
                          addBundleToDraft(bundle.module, bundle.sha256);
                      }}
                    >
                      <PackagePlus data-icon="inline-start" />
                      Add to draft
                    </Button>
                  </FieldGroup>
                ) : (
                  <p className="text-destructive">
                    Unavailable: check file ownership and permissions.
                  </p>
                )}
                <Separator />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Installation draft</CardTitle>
            <CardDescription>
              {text !== initial
                ? "Unsaved changes"
                : "Matches the saved manifest"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {snapshot?.invalid && (
              <p role="alert" className="text-destructive">
                The manifest is malformed. Repair it in Advanced JSON.
              </p>
            )}
            {configuration?.extensions.length === 0 && (
              <p className="text-muted-foreground">
                No extensions selected. Add an available bundle to get started.
              </p>
            )}
            {configuration?.extensions.map((extension) => (
              <div key={extension.name} className="flex items-start gap-3">
                <Puzzle className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{extension.name}</p>
                  <p className="wrap-anywhere text-xs text-muted-foreground">
                    {extension.module}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${extension.name} from draft`}
                  disabled={busy}
                  onClick={() =>
                    setText(
                      JSON.stringify(
                        {
                          extensions: configuration.extensions.filter(
                            (item) => item.name !== extension.name,
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
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <SettingsDisclosure title="How to add an extension">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            Create a self-contained .mjs bundle exporting a Durable extension
            factory. Its name must start with user.
          </li>
          <li>
            On the backend, place it in the Console data directory’s extensions
            folder. Use an owner-only directory (0700) and files (0600);
            symlinks are rejected. The default folder is
            ~/.local/share/console/extensions on the backend.
          </li>
          <li>
            Refresh this page, enter the exported name, and add the bundle. Save
            and activate, then select its tools and hooks in a conversation.
          </li>
        </ol>
        <InspectorCode
          language="javascript"
          label="Extension bundle example"
          code={
            'export default ({ defineExtension, defineTool }) => defineExtension({\n  name: "user.example",\n  tools: [defineTool({\n    name: "user_example_status",\n    description: "Report extension status",\n    parameters: { type: "object", properties: {}, additionalProperties: false },\n    execute: async () => ({ output: [{ type: "text", text: "Ready" }] }),\n  })],\n});'
          }
        />
        <p className="text-xs text-muted-foreground">
          Bundle dependencies into the file; relative imports are unavailable.
          The browser cannot upload or install arbitrary packages.
        </p>
      </SettingsDisclosure>
      <Separator />
      <section className="flex flex-col gap-4" aria-label="Active extensions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Active on this machine</h2>
          <Button
            variant="outline"
            disabled={busy || !snapshot || text !== initial}
            onClick={() => void run("reload")}
          >
            Reload saved definitions
          </Button>
        </div>
        {snapshot?.problem && (
          <p role="alert" className="text-destructive">
            {snapshot.problem}
          </p>
        )}
        {snapshot?.installed.length === 0 && (
          <p className="text-sm text-muted-foreground">No extensions active.</p>
        )}
        {snapshot?.installed.map((extension) => (
          <div key={extension.name} className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-medium">{extension.name}</h3>
            <p className="text-xs text-muted-foreground">
              Tools: {extension.tools.join(", ") || "none"} · Tasks:{" "}
              {extension.tasks
                .map((task) => `${task.name} v${task.version}`)
                .join(", ") || "none"}
            </p>
            <SettingsDisclosure title="Bundle details">
              <p className="wrap-anywhere font-mono text-xs text-muted-foreground">
                {extension.module} · SHA-256 {extension.sha256}
              </p>
            </SettingsDisclosure>
            <Separator />
          </div>
        ))}
      </section>
      <SettingsDisclosure title="Advanced JSON">
        <FieldGroup>
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={id}>Extension manifest JSON</FieldLabel>
            <Textarea
              id={id}
              className="font-mono"
              value={text}
              rows={12}
              maxLength={65536}
              disabled={busy}
              aria-invalid={invalid}
              onChange={(event) => {
                setText(event.target.value);
                setMessage(undefined);
              }}
            />
            <FieldDescription>
              Each entry pins a name, module and SHA-256. Empty extensions
              removes all managed definitions.
            </FieldDescription>
            {invalid && (
              <FieldError>
                Enter a JSON object with an extensions array.
              </FieldError>
            )}
          </Field>
        </FieldGroup>
      </SettingsDisclosure>
      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            busy ||
            !snapshot ||
            invalid ||
            (text === initial && !snapshot.invalid)
          }
          onClick={() => void run("save")}
        >
          {busy ? "Working…" : "Save and activate"}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run("refresh")}
        >
          {text !== initial ? "Discard changes & refresh" : "Refresh bundles"}
        </Button>
      </div>
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
