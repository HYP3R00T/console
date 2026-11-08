"use client";
import { Download, HardDriveDownload, Undo2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  type ConfigurationBackup,
  clientConfiguration,
  parseBackup,
} from "@/lib/configuration/store";
import { SettingsHeading } from "./settings-presentation";

export function ConfigurationSettings() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ConfigurationBackup>();
  const [message, setMessage] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [reading, setReading] = useState(false);
  function run(action: () => void) {
    try {
      action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Backup operation failed.",
      );
    }
  }
  async function read(file?: File) {
    if (!file || reading) return;
    setReading(true);
    setPreview(undefined);
    setMessage("");
    try {
      if (file.size > 2_000_000)
        throw new Error("Choose a JSON backup smaller than 2 MB.");
      setPreview(parseBackup(JSON.parse(await file.text())));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not read backup.",
      );
    } finally {
      setReading(false);
    }
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <SettingsHeading
        title="Backup/Restore"
        icon={HardDriveDownload}
        description="Take your preferences with you."
        help="Includes appearance, shortcuts, themes, machine bookmarks, pins and navigation. Backend settings, credentials, transcripts and runtime data are excluded."
      />
      <Separator />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="size-4" />
              Export
            </CardTitle>
            <CardDescription>
              Download your current preferences as JSON.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() =>
                run(() => {
                  const url = URL.createObjectURL(
                    new Blob(
                      [JSON.stringify(clientConfiguration().export(), null, 2)],
                      { type: "application/json" },
                    ),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "console-configuration.json";
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  setMessage("Backup downloaded.");
                })
              }
            >
              <Download data-icon="inline-start" />
              Export backup
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="size-4" />
              Import
            </CardTitle>
            <CardDescription>
              Choose a backup to review before restoring.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <section
              aria-label="Import backup drop zone"
              className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void read(e.dataTransfer.files[0]);
              }}
            >
              <p className="text-sm text-muted-foreground">
                Drop a JSON backup here.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                aria-label="Import backup"
                className="hidden"
                disabled={reading}
                onChange={(e) => {
                  void read(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                disabled={reading}
                onClick={() => fileInput.current?.click()}
              >
                <Upload data-icon="inline-start" />
                {reading ? "Reading…" : "Choose file"}
              </Button>
            </section>
          </CardContent>
        </Card>
      </div>
      {preview && (
        <Card aria-label="Import preview">
          <CardHeader>
            <CardTitle>Restore this backup?</CardTitle>
            <CardDescription>
              These categories will be replaced. Existing connections will
              disconnect; reconnect imported machines yourself.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Appearance</dt>
                <dd>{preview.settings.appearance.mode}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Shortcut overrides</dt>
                <dd>{Object.keys(preview.keybindings).length}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Imported themes</dt>
                <dd>{preview.themes.length}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Machine bookmarks</dt>
                <dd>{preview.settings.bookmarks.length}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Pins & navigation</dt>
                <dd>Replace all</dd>
              </div>
            </dl>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  run(() => {
                    clientConfiguration().import(preview);
                    setPreview(undefined);
                    setCanUndo(true);
                    setMessage(
                      "Backup restored. Reconnect machines when ready.",
                    );
                  })
                }
              >
                Restore backup
              </Button>
              <Button variant="outline" onClick={() => setPreview(undefined)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
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
                "Previous preferences restored. Reconnect machines when ready.",
              );
            })
          }
        >
          <Undo2 data-icon="inline-start" />
          Undo restore
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
