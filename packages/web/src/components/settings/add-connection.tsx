"use client";

import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useDevices } from "@/components/devices/device-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { pairBackend } from "@/lib/backend/auth";

export function AddConnection() {
  const registry = useDevices();
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("http://127.0.0.1:3000");
  const [pairingCode, setPairingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      if (pairingCode.trim()) await pairBackend(url, pairingCode, name);
      registry.add(name, url);
      router.push("/devices");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this device.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
      <div>
        <Button
          nativeButton={false}
          variant="ghost"
          className="-ml-2 mb-4"
          render={<Link href="/devices" />}
        >
          <ArrowLeft />
          Manage devices
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">Add device</h1>
      </div>
      <form onSubmit={submit} className="border">
        <div className="p-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="device-name">Name</FieldLabel>
              <Input
                id="device-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My workstation"
                required
                maxLength={80}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="device-url">Backend URL</FieldLabel>
              <Input
                id="device-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pairing-code">
                Pairing code (authenticated backends)
              </FieldLabel>
              <Input
                id="pairing-code"
                type="password"
                autoComplete="off"
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value)}
              />
            </Field>
          </FieldGroup>
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t bg-muted/20 px-6 py-4">
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/devices" />}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!registry.ready || busy}>
            <Plus />
            Add device
          </Button>
        </div>
      </form>
    </div>
  );
}
