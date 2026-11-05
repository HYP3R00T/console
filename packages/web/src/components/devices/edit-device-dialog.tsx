"use client";
import { useState } from "react";
import {
  DeviceIcon,
  deviceColorClasses,
} from "@/components/devices/device-icon";
import { useDevices } from "@/components/devices/device-provider";
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
  type Device,
  type DeviceAppearance,
  deviceColors,
  deviceIcons,
} from "@/lib/devices";
import { cn } from "@/lib/utils";

export function EditDeviceDialog({
  device,
  onClose,
}: {
  device: Device;
  onClose: () => void;
}) {
  const registry = useDevices();
  const [name, setName] = useState(device.name);
  const [url, setUrl] = useState(device.url);
  const [icon, setIcon] = useState<DeviceAppearance["icon"]>(
    device.icon ?? "monitor",
  );
  const [color, setColor] = useState<DeviceAppearance["color"]>(
    device.color ?? "neutral",
  );
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
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

            try {
              registry.edit(device.id, name, url, { icon, color });
              onClose();
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
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Icon</legend>
            <div className="flex flex-wrap gap-2">
              {deviceIcons.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${value} icon`}
                  aria-pressed={icon === value}
                  className={icon === value ? "bg-accent" : undefined}
                  onClick={() => setIcon(value)}
                >
                  <DeviceIcon device={{ icon: value, color }} />
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Color</legend>
            <div className="flex flex-wrap gap-2">
              {deviceColors.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${value} color`}
                  aria-pressed={color === value}
                  className={color === value ? "bg-accent" : undefined}
                  onClick={() => setColor(value)}
                >
                  <span
                    className={cn(
                      "size-3 rounded-full bg-current",
                      deviceColorClasses[value],
                    )}
                  />
                </Button>
              ))}
            </div>
          </fieldset>
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
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
