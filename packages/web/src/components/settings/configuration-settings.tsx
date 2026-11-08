"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type ConfigurationBackup,
  clientConfiguration,
  parseBackup,
} from "@/lib/configuration/store";
import { themeCatalog } from "@/lib/configuration/themes";

export function ConfigurationSettings() {
  const [preview, setPreview] = useState<ConfigurationBackup>();
  const [message, setMessage] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [reading, setReading] = useState(false);
  function run(action: () => void) {
    try {
      action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Configuration operation failed.",
      );
    }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">Client configuration</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Saved only in this browser. Export settings, keybindings, themes,
          bookmarks, pins and navigation. Backend settings and credentials are
          excluded.
        </p>
      </header>
      <Button
        className="self-start"
        onClick={() =>
          run(() => {
            const blob = new Blob(
              [JSON.stringify(clientConfiguration().export(), null, 2)],
              { type: "application/json" },
            );
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "console-configuration.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage("Client configuration exported.");
          })
        }
      >
        Export configuration
      </Button>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="configuration-import">
            Import configuration
          </FieldLabel>
          <Input
            id="configuration-import"
            type="file"
            accept="application/json,.json"
            disabled={reading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setReading(true);
              setPreview(undefined);
              try {
                if (file.size > 2_000_000)
                  throw new Error(
                    "Configuration files must be smaller than 2 MB.",
                  );
                setPreview(parseBackup(JSON.parse(await file.text())));
                setMessage("");
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Could not read configuration.",
                );
              } finally {
                setReading(false);
              }
            }}
          />
          <FieldDescription>
            Imports replace all exported categories. Existing connections are
            disconnected; imported bookmarks require an explicit connection.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {preview && (
        <section aria-label="Import preview" className="flex flex-col gap-3">
          <h2 className="font-medium">Replace client configuration?</h2>
          <p className="text-sm text-muted-foreground">
            Appearance: {preview.settings.appearance.mode}. Light:{" "}
            {
              themeCatalog(preview.themes).find(
                (theme) => theme.id === preview.settings.appearance.lightTheme,
              )?.name
            }
            ; dark:{" "}
            {
              themeCatalog(preview.themes).find(
                (theme) => theme.id === preview.settings.appearance.darkTheme,
              )?.name
            }
            . {Object.keys(preview.keybindings).length} shortcut overrides,{" "}
            {preview.themes.length} themes, {preview.settings.bookmarks.length}{" "}
            bookmarks. Project pins, conversation pins and navigation will also
            be replaced.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                run(() => {
                  clientConfiguration().import(preview);
                  setPreview(undefined);
                  setCanUndo(true);
                  setMessage(
                    "Configuration imported. Connections remain disconnected.",
                  );
                })
              }
            >
              Replace configuration
            </Button>
            <Button variant="outline" onClick={() => setPreview(undefined)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
      {canUndo && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            run(() => {
              clientConfiguration().undo();
              setCanUndo(false);
              setMessage(
                "Previous configuration restored. Reconnect machines explicitly.",
              );
            })
          }
        >
          Undo import
        </Button>
      )}
      <p role="status" className="text-sm">
        {reading ? "Reading configuration…" : message}
      </p>
    </div>
  );
}
