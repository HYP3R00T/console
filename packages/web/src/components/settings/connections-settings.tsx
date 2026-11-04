"use client";
import { Monitor, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useConnections } from "@/components/connection-provider";
import { useDevices } from "@/components/devices/device-provider";
import { ConnectionStatus } from "@/components/layout/connection-status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Device } from "@/lib/devices";

export function ConnectionsSettings() {
  const registry = useDevices();
  const { states } = useConnections();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<Device>();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const devices = registry.devices.filter((device) =>
    `${device.name} ${device.url}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Manage devices</h1>
        <Button nativeButton={false} render={<Link href="/devices/new" />}>
          <Plus />
          Add device
        </Button>
      </header>
      {(registry.error || error) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? registry.error}
        </p>
      )}
      {!registry.ready ? (
        <p>Loading devices…</p>
      ) : (
        <>
          <Input
            className="max-w-sm border-0 bg-muted/40"
            placeholder="Search devices"
            aria-label="Search devices"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Table className="block md:table">
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="block md:table-row-group">
              {devices.map((device) => {
                const connection = states[device.id];
                return (
                  <TableRow
                    key={device.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-4 md:table-row md:py-0"
                  >
                    <TableCell className="min-w-0 p-0 md:p-2">
                      <Link
                        className="flex min-w-0 items-center gap-2 font-medium hover:underline"
                        href={`/devices/${encodeURIComponent(device.id)}`}
                      >
                        <Monitor className="size-4 shrink-0" />
                        <span className="truncate">{device.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="col-span-2 row-start-2 max-w-sm whitespace-normal p-0 md:p-2">
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {device.url}
                      </p>
                      {connection?.checkedAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Checked{" "}
                          {new Date(connection.checkedAt).toLocaleTimeString()}
                        </p>
                      )}
                      {connection?.error && (
                        <p
                          role="alert"
                          className="mt-1 whitespace-normal text-xs text-destructive"
                        >
                          {connection.error}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="col-start-2 row-start-1 p-0 md:p-2">
                      <ConnectionStatus deviceId={device.id} />
                    </TableCell>
                    <TableCell className="col-span-2 p-0 md:p-2">
                      <div className="flex items-center justify-end gap-2">
                        {connection?.status === "connected" ||
                        connection?.status === "connecting" ? (
                          <Button
                            variant="outline"
                            aria-label={`${connection.status === "connecting" ? "Cancel connection to" : "Disconnect"} ${device.name}`}
                            onClick={() => registry.disconnect(device.id)}
                          >
                            {connection.status === "connecting"
                              ? "Cancel"
                              : "Disconnect"}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            aria-label={`Connect ${device.name}`}
                            onClick={() => registry.connect(device)}
                          >
                            Connect
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${device.name}`}
                          onClick={() => {
                            setEditing(device);
                            setName(device.name);
                            setUrl(device.url);
                            setError(undefined);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Forget ${device.name}`}
                          onClick={() => {
                            try {
                              registry.remove(device.id);
                              setError(undefined);
                            } catch (cause) {
                              setError(
                                cause instanceof Error
                                  ? cause.message
                                  : "Could not forget device.",
                              );
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!devices.length && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {registry.devices.length
                      ? "No matching devices."
                      : "No saved devices."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit connection</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editing) return;
              try {
                registry.edit(editing.id, name, url);
                setEditing(undefined);
                setError(undefined);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not save device.",
                );
              }
            }}
          >
            <Field>
              <FieldLabel htmlFor="edit-device-name">Name</FieldLabel>
              <Input
                id="edit-device-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-device-url">Backend URL</FieldLabel>
              <Input
                id="edit-device-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
                type="url"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Saving disconnects this device. Reconnect to verify its identity.
            </p>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
