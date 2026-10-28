"use client";
import { CheckIcon, TrashIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
export function ConfirmDelete({
  label,
  disabled,
  onConfirm,
}: {
  label: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const action = useRef<HTMLButtonElement>(null);
  const previous = useRef(false);
  useEffect(() => {
    if (confirming || previous.current) action.current?.focus();
    previous.current = confirming;
  }, [confirming]);
  return (
    <fieldset
      aria-label={label}
      className="m-0 inline-flex w-12 min-w-0 shrink-0 justify-end border-0 p-0"
      onKeyDown={(event) => {
        if (event.key === "Escape") setConfirming(false);
      }}
    >
      {confirming ? (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-destructive"
            disabled={disabled}
            ref={action}
            aria-label={`Confirm ${label}`}
            title={`Confirm ${label}`}
            onClick={() => {
              setConfirming(false);
              onConfirm();
            }}
          >
            <CheckIcon className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            disabled={disabled}
            aria-label={`Cancel ${label}`}
            onClick={() => setConfirming(false)}
          >
            <XIcon className="size-3" />
          </Button>
        </>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="size-6 text-destructive"
          disabled={disabled}
          ref={action}
          title={label}
          aria-label={label}
          onClick={() => setConfirming(true)}
        >
          <TrashIcon className="size-3" />
        </Button>
      )}
    </fieldset>
  );
}
