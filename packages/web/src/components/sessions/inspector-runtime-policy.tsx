"use client";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  applyFields,
  fieldError,
  fieldValue,
  modelFields,
  modelPolicies,
  type PolicyField,
  policyGroups,
  type RuntimePolicy,
  setModelPolicy,
} from "./runtime-policy-form";

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
  const id = useId();
  const [draft, setDraft] = useState<{
    original: string;
    values: Record<string, string>;
    models: RuntimePolicy;
  }>();
  const [modelKey, setModelKey] = useState("");
  const [modelError, setModelError] = useState("");
  const [notice, setNotice] = useState("");
  const original = JSON.stringify(value);
  const stale = !!draft && draft.original !== original;
  const fields = policyGroups.flatMap((group) => group.fields);
  const values = draft?.values ?? {};
  const models = draft?.models ?? modelPolicies(value);
  const invalid =
    fields.some((field) =>
      fieldError(field, values[field.key] ?? fieldValue(value, field.key)),
    ) ||
    Object.values(models).some(
      (policy) =>
        typeof policy === "object" &&
        modelFields.some((field) =>
          fieldError(field, fieldValue(policy, field.key)),
        ),
    );
  function edit(values: Record<string, string>, nextModels = models) {
    setNotice("");
    setDraft({
      original: draft?.original ?? original,
      values,
      models: nextModels,
    });
  }
  const locked = disabled || stale;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Session runtime policies</CardTitle>
        <CardDescription>
          Shared by all conversations and reviewers in this session. Save when
          the whole session is idle. Blank fields and Default follow the backend
          defaults.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
                    value={values[field.key] ?? fieldValue(value, field.key)}
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
                  <Card key={key} size="sm">
                    <CardHeader>
                      <CardTitle className="wrap-anywhere">{key}</CardTitle>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                    <CardFooter>
                      <Button
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
                    </CardFooter>
                  </Card>
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
                  size="xs"
                  variant="ghost"
                  disabled={locked}
                  onClick={() => setModelKey(model)}
                >
                  Use current model
                </Button>
              )}
              <Button
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
        {stale && (
          <p role="alert" className="text-destructive">
            Policies changed elsewhere. Reset your draft before saving.
          </p>
        )}
        <p role="status" className="text-muted-foreground">
          {notice}
        </p>
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-2">
        {draft && (
          <Button size="xs" variant="ghost" onClick={() => setDraft(undefined)}>
            Reset draft
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          disabled={
            disabled || stale || !!draft || Object.keys(value).length === 0
          }
          onClick={async () => {
            if (await save(null)) {
              setNotice("Session defaults restored.");
              setDraft(undefined);
            }
          }}
        >
          Restore defaults
        </Button>
        <Button
          size="xs"
          disabled={locked || !draft || invalid}
          onClick={async () => {
            let next = applyFields(value, fields, values);
            for (const key of Object.keys(modelPolicies(next)))
              next = setModelPolicy(next, key, null);
            for (const [key, policy] of Object.entries(models))
              if (typeof policy === "object")
                next = setModelPolicy(
                  next,
                  key,
                  applyFields(
                    {},
                    modelFields,
                    Object.fromEntries(
                      modelFields.map((field) => [
                        field.key,
                        fieldValue(policy, field.key),
                      ]),
                    ),
                  ),
                );
            if (await save(next)) {
              setDraft(undefined);
              setNotice("Session policies saved.");
            }
          }}
        >
          Save policies
        </Button>
      </CardFooter>
    </Card>
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
