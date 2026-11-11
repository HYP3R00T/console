"use client";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type RuntimePolicyDraft,
  resetRuntimePolicyDraft,
  runtimePolicyDraftInvalid,
  runtimePolicyDraftValue,
} from "@/lib/runtime-policy-draft";
import {
  InspectorSection,
  InspectorSectionActions,
  InspectorSectionContent,
  InspectorSectionDescription,
  InspectorSectionHeader,
  InspectorSectionTitle,
} from "./inspector-section";
import {
  fieldError,
  fieldValue,
  modelFields,
  modelPolicies,
  type PolicyField,
  policyGroups,
  type RuntimePolicy,
} from "./runtime-policy-form";

export function RuntimePolicyFields({
  value,
  draft,
  onChange,
  disabled,
  model,
}: {
  value: RuntimePolicy;
  draft?: RuntimePolicyDraft;
  onChange: (draft: RuntimePolicyDraft) => void;
  disabled: boolean;
  model?: string;
}) {
  const id = useId();
  const [modelKey, setModelKey] = useState("");
  const [modelError, setModelError] = useState("");
  const base = draft?.base ?? value;
  const values = draft?.values ?? {};
  const models = draft?.models ?? modelPolicies(value);
  const locked = disabled;
  function edit(values: Record<string, string>, nextModels = models) {
    onChange({
      original: draft?.original ?? JSON.stringify(value),
      base,
      values,
      models: nextModels,
      reset: draft?.reset,
    });
  }
  return (
    <div className="flex flex-col gap-3">
      {policyGroups.map((group) => (
        <Collapsible key={group.title} className="group/policy">
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" />}
            className="h-auto min-h-7 w-full justify-start whitespace-normal"
          >
            <ChevronRight
              aria-hidden
              data-icon="inline-start"
              className="group-data-panel-open/policy:rotate-90"
            />
            {group.title}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <FieldGroup>
              {group.fields.map((field) => (
                <PolicyInput
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? fieldValue(base, field.key)}
                  disabled={locked}
                  change={(text) => edit({ ...values, [field.key]: text })}
                />
              ))}
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>
      ))}
      <Collapsible className="group/model-policy">
        <CollapsibleTrigger
          render={<Button variant="ghost" size="sm" />}
          className="h-auto min-h-7 w-full justify-start whitespace-normal"
        >
          <ChevronRight
            aria-hidden
            data-icon="inline-start"
            className="group-data-panel-open/model-policy:rotate-90"
          />
          Per-model compaction ({Object.keys(models).length})
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 pt-3">
          <p className="text-muted-foreground">
            These values override session compaction settings for the exact
            model, including the automatic-compaction toggle above.
          </p>
          {Object.entries(models).map(
            ([key, policy]) =>
              typeof policy === "object" && (
                <InspectorSection key={key}>
                  <InspectorSectionHeader>
                    <InspectorSectionTitle className="wrap-anywhere">
                      {key}
                    </InspectorSectionTitle>
                  </InspectorSectionHeader>
                  <InspectorSectionContent>
                    <FieldGroup>
                      {modelFields.map((field) => (
                        <PolicyInput
                          key={field.key}
                          field={field}
                          value={fieldValue(policy, field.key)}
                          disabled={locked}
                          change={(text) =>
                            edit(values, {
                              ...models,
                              [key]: { ...policy, [field.key]: text },
                            })
                          }
                        />
                      ))}
                    </FieldGroup>
                  </InspectorSectionContent>
                  <InspectorSectionActions>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={locked}
                      onClick={() => {
                        const next = { ...models };
                        delete next[key];
                        edit(values, next);
                      }}
                    >
                      Remove model override
                    </Button>
                  </InspectorSectionActions>
                </InspectorSection>
              ),
          )}
          <FieldGroup>
            <Field data-invalid={!!modelError} data-disabled={locked}>
              <FieldLabel htmlFor={id}>Model identifier</FieldLabel>
              <Input
                id={id}
                value={modelKey}
                disabled={locked}
                placeholder={model ?? "provider/model-id"}
                aria-invalid={!!modelError}
                aria-describedby={`${id}-help`}
                onChange={(event) => {
                  setModelKey(event.target.value);
                  setModelError("");
                }}
              />
              <FieldDescription id={`${id}-help`}>
                Use the exact provider/model ID. You can configure a model
                before enabling it.
              </FieldDescription>
              {modelError && <FieldError>{modelError}</FieldError>}
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            {model && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={locked}
                onClick={() => setModelKey(model)}
              >
                Use current model
              </Button>
            )}
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={locked}
              onClick={() => {
                const key = modelKey.trim();
                if (!/^[^/\s]+\/.+$/.test(key) || key.length > 256) {
                  setModelError("Enter provider/model-id.");
                  return;
                }
                if (Object.hasOwn(models, key)) {
                  setModelError("This model already has an override.");
                  return;
                }
                if (Object.keys(models).length >= 100) {
                  setModelError(
                    "Remove an override before adding another (limit 100).",
                  );
                  return;
                }
                edit(values, { ...models, [key]: {} });
                setModelKey("");
              }}
            >
              Add model override
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function InspectorRuntimePolicy({
  value,
  disabled,
  model,
  save,
}: {
  value: RuntimePolicy;
  disabled: boolean;
  model?: string;
  save: (value: RuntimePolicy | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<RuntimePolicyDraft>();
  const [notice, setNotice] = useState("");
  const stale = !!draft && draft.original !== JSON.stringify(value);
  const invalid = runtimePolicyDraftInvalid(value, draft);
  return (
    <InspectorSection>
      <InspectorSectionHeader>
        <InspectorSectionTitle>Execution policies</InspectorSectionTitle>
        <InspectorSectionDescription>
          Shared by this session’s conversations and workers. Blank values
          inherit backend defaults.
        </InspectorSectionDescription>
      </InspectorSectionHeader>
      <InspectorSectionContent>
        <RuntimePolicyFields
          value={value}
          draft={draft}
          onChange={setDraft}
          disabled={disabled || stale}
          model={model}
        />
        {stale && (
          <p role="alert" className="text-xs text-destructive">
            Policies changed elsewhere. Discard this draft before saving.
          </p>
        )}
        {(notice || draft?.reset) && (
          <p role="status" className="text-xs text-foreground/65">
            {draft?.reset ? "Defaults staged. Save to apply." : notice}
          </p>
        )}
      </InspectorSectionContent>
      <InspectorSectionActions>
        {draft && (
          <>
            <Button
              size="sm"
              disabled={disabled || stale || invalid}
              onClick={async () => {
                if (await save(runtimePolicyDraftValue(draft))) {
                  setDraft(undefined);
                  setNotice("Policies saved.");
                }
              }}
            >
              Save changes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => setDraft(undefined)}
            >
              Discard changes
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={
            disabled || stale || (!draft && Object.keys(value).length === 0)
          }
          onClick={() => setDraft(resetRuntimePolicyDraft(value))}
        >
          Restore defaults
        </Button>
      </InspectorSectionActions>
    </InspectorSection>
  );
}

function PolicyInput({
  field,
  value,
  disabled,
  change,
}: {
  field: PolicyField;
  value: string;
  disabled: boolean;
  change: (value: string) => void;
}) {
  const id = useId();
  const error = fieldError(field, value);
  return (
    <Field data-disabled={disabled} data-invalid={!!error}>
      <FieldLabel id={`${id}-label`} htmlFor={field.choices ? undefined : id}>
        {field.label}
      </FieldLabel>
      {field.choices ? (
        <ToggleGroup
          variant="outline"
          size="sm"
          className="flex-wrap"
          value={[value || "default"]}
          disabled={disabled}
          aria-labelledby={`${id}-label`}
          onValueChange={(selected) =>
            change(selected[0] === "default" ? "" : String(selected[0] ?? ""))
          }
        >
          {[["default", "Default"], ...field.choices].map(([key, label]) => (
            <ToggleGroupItem key={key} value={key}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          placeholder="Default"
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => change(event.target.value)}
        />
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}
