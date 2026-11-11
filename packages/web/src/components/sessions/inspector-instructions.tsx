"use client";

import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  InspectorSection,
  InspectorSectionAction,
  InspectorSectionActions,
  InspectorSectionContent,
  InspectorSectionDescription,
  InspectorSectionHeader,
  InspectorSectionTitle,
} from "./inspector-section";
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
  const [draft, setDraft] = useState<{
    text: string;
    original: string;
    reset?: boolean;
  }>();
  const [preview, setPreview] = useState(false);
  const changed = !!draft && draft.original !== value;
  const text = draft?.text ?? value;
  return (
    <InspectorSection>
      <InspectorSectionHeader>
        <InspectorSectionTitle>{label}</InspectorSectionTitle>
        <InspectorSectionDescription id={`${id}-scope`}>
          {scope}
        </InspectorSectionDescription>
        {customized !== undefined && (
          <InspectorSectionAction>
            <Badge variant="secondary">
              {customized ? "Custom" : "Default"}
            </Badge>
          </InspectorSectionAction>
        )}
      </InspectorSectionHeader>
      <InspectorSectionContent className="flex min-w-0 flex-col gap-2">
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
                  Saved guidance changed elsewhere. Discard the draft to review
                  it.
                </FieldError>
              )}
            </Field>
          </FieldGroup>
        )}
      </InspectorSectionContent>
      {draft?.reset && (
        <p role="status" className="text-xs text-foreground/65">
          Default guidance staged. Save to apply.
        </p>
      )}
      <InspectorSectionActions className="flex-wrap justify-between gap-2">
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
              Discard changes
            </Button>
          ) : (
            customized && (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  setDraft({ original: value, text: "", reset: true });
                }}
              >
                Restore default
              </Button>
            )
          )}
          <Button
            size="xs"
            disabled={
              disabled || changed || (!draft?.reset && text.trim() === value)
            }
            onClick={async () => {
              if (await save(draft?.reset ? null : text)) setDraft(undefined);
            }}
          >
            Save
          </Button>
        </div>
      </InspectorSectionActions>
    </InspectorSection>
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
    <InspectorSection>
      <InspectorSectionHeader>
        <InspectorSectionTitle>
          Environment and permissions
        </InspectorSectionTitle>
        <InspectorSectionDescription>
          Console reports these facts to the model.
        </InspectorSectionDescription>
      </InspectorSectionHeader>
      <InspectorSectionContent className="flex min-w-0 flex-col gap-4">
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
      </InspectorSectionContent>
    </InspectorSection>
  );
}
