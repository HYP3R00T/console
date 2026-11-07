"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
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
    <div className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Extensions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Install trusted code provisioned by this backend’s owner. Extensions
          run with the backend user’s full privileges. Installation makes
          definitions available; choose tools and hooks separately in each
          conversation.
        </p>
      </header>
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
      name: existing?.name ?? `user.${module.slice(0, -4)}`,
      module,
      sha256,
    };
    setText(
      JSON.stringify(
        {
          extensions: [
            ...configuration.extensions.filter(
              (item) => item.name !== entry.name,
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
    <>
      <Card>
        <CardHeader>
          <CardTitle>Installed definitions</CardTitle>
          <CardDescription>
            Active code can differ from the saved manifest after a failed
            reload. Removal preserves conversation selections and saved tasks;
            restore compatible definitions to resume blocked work.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {snapshot?.problem && <p role="alert">{snapshot.problem}</p>}
          {snapshot?.installed.length === 0 && (
            <p>No managed extensions are active.</p>
          )}
          <ul className="flex flex-col gap-3">
            {snapshot?.installed.map((extension) => (
              <li
                key={extension.name}
                className="flex flex-col gap-1 wrap-anywhere"
              >
                <p>{extension.name}</p>
                <p className="text-muted-foreground">
                  {extension.module} · SHA-256 {extension.sha256}
                </p>
                <p>Tools: {extension.tools.join(", ") || "none"}</p>
                <p>
                  Tasks:{" "}
                  {extension.tasks
                    .map((task) => `${task.name} v${task.version}`)
                    .join(", ") || "none"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !configuration}
                  onClick={() => {
                    if (!configuration) return;
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
                    );
                    setMessage({
                      text: "Removal added to the draft. Save to apply it.",
                    });
                  }}
                >
                  Remove {extension.name} from draft
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            disabled={busy || !snapshot || text !== initial}
            onClick={() => void run("reload")}
          >
            Reload saved definitions
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Extension configuration</CardTitle>
          <CardDescription>
            The owner provisions self-contained .mjs bundles in the backend data
            directory’s extensions folder (0700), with owner-only files (0600).
            Select only code you trust. Saving executes its factory.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {snapshot?.invalid && (
            <p role="alert">
              The saved manifest is malformed. Enter a valid replacement to
              repair it.
            </p>
          )}
          {!snapshot && !message && <p role="status">Loading extensions…</p>}
          {candidates?.problem && <p>{candidates.problem}</p>}
          {candidates?.truncated && (
            <p>Only the first 128 bundle filenames are listed.</p>
          )}
          <ul className="flex flex-col gap-2">
            {candidates?.modules.map((bundle) => (
              <li
                key={bundle.module}
                className="flex flex-wrap items-center gap-2"
              >
                <span>{bundle.module}</span>
                {bundle.sha256 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !configuration}
                    onClick={() => {
                      if (bundle.sha256)
                        addBundleToDraft(bundle.module, bundle.sha256);
                    }}
                  >
                    Use {bundle.module}
                  </Button>
                ) : (
                  <span>
                    Unavailable: check file ownership and permissions.
                  </span>
                )}
              </li>
            ))}
          </ul>
          {snapshot && (
            <FieldGroup>
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={id}>Extension manifest JSON</FieldLabel>
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
                  Each entry requires name, module and sha256. Names must match
                  the bundle’s exported user.* identity. Keep a stable name when
                  replacing a bundle; remove entries to uninstall. Empty
                  extensions removes all managed definitions.
                </FieldDescription>
                {invalid && (
                  <FieldError>
                    Enter a JSON object with an extensions array.
                  </FieldError>
                )}
              </Field>
            </FieldGroup>
          )}
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
            onClick={() => void run("save")}
          >
            {busy ? "Working…" : "Save and activate"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run("refresh")}
          >
            {snapshot ? "Reload and discard edits" : "Retry loading"}
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
