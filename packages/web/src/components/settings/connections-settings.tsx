"use client";

import { Monitor, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { useDevices } from "@/components/devices/device-provider";
import { ConnectionStatus } from "@/components/layout/connection-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ConnectionsSettings() {
  const registry = useDevices();
  const connection = useConnection();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();
  const devices = registry.devices.filter((device) =>
    `${device.name} ${device.url}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Saved devices
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Client device bookmarks.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/settings/connections/new" />}
        >
          <Plus />
          Add device
        </Button>
      </div>
      {(registry.error || error) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? registry.error}
        </p>
      )}
      {!registry.ready ? (
        <p className="text-sm text-muted-foreground">Loading devices…</p>
      ) : !registry.devices.length ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Monitor />
            </EmptyMedia>
            <EmptyTitle>No devices</EmptyTitle>
            <EmptyDescription>Add a local backend to begin.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search devices…"
              aria-label="Search devices"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Device</TableHead>
                  <TableHead>Backend URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="pl-4 font-medium">
                      <div className="flex items-center gap-2">
                        <Monitor className="size-4 text-muted-foreground" />
                        {device.name}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {device.url}
                    </TableCell>
                    <TableCell>
                      {connection.origin === device.url ? (
                        <ConnectionStatus />
                      ) : (
                        <Badge variant="outline" className="font-normal">
                          Not connected
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          nativeButton={false}
                          variant="outline"
                          render={
                            <Link
                              href={`/devices/${encodeURIComponent(device.id)}/settings`}
                            />
                          }
                        >
                          Open
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Forget ${device.name}`}
                          onClick={() => {
                            try {
                              registry.remove(device.id);
                              setError(undefined);
                            } catch {
                              setError(
                                "This browser could not update the saved device list.",
                              );
                            }
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!devices.length && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No devices match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Removing a connection leaves its backend running.
          </p>
        </div>
      )}
    </div>
  );
}
