"use client";

import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { MessageMarkdown } from "./message-markdown";

export type Guidance = {
  workspace: { text: string; customized: boolean };
  inspection?: { text: string; customized: boolean };
  directory: string;
  projectName?: string;
};

export function InstructionEditor({
  label,
  scope,
  placeholder,
  value,
  disabled,
  customized,
  save,
}: {
  label: string;
  scope: string;
  placeholder?: string;
  value: string;
  disabled: boolean;
  customized?: boolean;
  save: (value: string | null) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{ text: string; original: string }>();
  const [preview, setPreview] = useState(false);
  const changed = !!draft && draft.original !== value;
  const text = draft?.text ?? value;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription id={`${id}-scope`}>{scope}</CardDescription>
        {customized !== undefined && (
          <CardAction>
            <Badge variant="secondary">
              {customized ? "Custom" : "Default"}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2">
        {preview ? (
          <div className="min-h-16 wrap-anywhere rounded-md bg-muted/50 p-3">
            {text.trim() ? (
              <MessageMarkdown text={text} compact />
            ) : (
              <p className="text-muted-foreground">Nothing to preview.</p>
            )}
          </div>
        ) : (
          <FieldGroup>
            <Field data-disabled={disabled} data-invalid={changed}>
              <FieldLabel htmlFor={id} className="sr-only">
                {label}
              </FieldLabel>
              <Textarea
                id={id}
                className="min-h-16 max-h-72"
                maxLength={16000}
                value={text}
                disabled={disabled}
                aria-invalid={changed}
                aria-describedby={`${id}-scope`}
                placeholder={placeholder}
                onChange={(event) =>
                  setDraft({
                    original: draft?.original ?? value,
                    text: event.target.value,
                  })
                }
              />
              {changed && (
                <FieldError>
                  Saved guidance changed elsewhere. Reset the draft to review
                  it.
                </FieldError>
              )}
            </Field>
          </FieldGroup>
        )}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Edit Markdown" : "Preview"}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {draft && (text !== value || changed) ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setDraft(undefined)}
            >
              Reset draft
            </Button>
          ) : (
            customized && (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                onClick={async () => {
                  if (await save(null)) setDraft(undefined);
                }}
              >
                Restore default
              </Button>
            )
          )}
          <Button
            size="xs"
            disabled={disabled || changed || text.trim() === value}
            onClick={async () => {
              if (await save(text)) setDraft(undefined);
            }}
          >
            Save
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export function RuntimeGuidance({
  guidance,
  sections,
}: {
  guidance?: Guidance;
  sections: { key: string; text: string }[];
}) {
  const other = guidance
    ? sections.filter(
        ({ key }) => key !== "workspace" && key !== "console_project",
      )
    : sections;
  if (!guidance && !other.length) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Environment and permissions</CardTitle>
        <CardDescription>
          Console reports these facts to the model.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {guidance && (
          <>
            <dl className="flex min-w-0 flex-col gap-3">
              {guidance.projectName && (
                <div>
                  <dt className="text-muted-foreground">Project</dt>
                  <dd>{guidance.projectName}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Working directory</dt>
                <dd className="wrap-anywhere">
                  <code>{guidance.directory}</code>
                </dd>
              </div>
            </dl>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>
                Coding tools run with the backend user’s filesystem and shell
                access.
              </li>
              <li>File contents are treated as data.</li>
            </ul>
          </>
        )}
        {other.map(({ key, text }) => (
          <div key={key} className="flex min-w-0 flex-col gap-1">
            <h3 className="font-medium">
              {key === "workspace"
                ? "Workspace"
                : key === "console_project"
                  ? "Project environment"
                  : key}
            </h3>
            <MessageMarkdown compact text={text} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
