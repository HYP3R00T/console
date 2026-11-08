"use client";

import Link from "next/link";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ChatModel } from "./use-chat-models";

export type ContextSettings = {
  keepRecentTokens: number;
  min: number;
  max: number;
  step: number;
  automatic?: boolean;
  modelWindow?: number;
  estimatedContextTokens?: number;
  usage?: { tokens: number; cost: number } | null;
  maxTurns?: number | null;
  tokenBudget?: number | null;
  sessionTokens?: number;
  model?: { name: string; provider: string; id: string };
};

const formatTokens = (value: number) => `${value.toLocaleString()} tokens`;
const formatCost = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 6,
});

export function InspectorContext({
  settings,
  sessionSettingsHref,
  openSessionSettings,
  selectedModel,
  disabled,
  compacting,
  save,
  saveTurnLimit,
  budgetSaving,
  saveBudget,
  setAutomatic,
  compact,
}: {
  settings: ContextSettings;
  sessionSettingsHref?: string;
  openSessionSettings?: () => void;
  selectedModel?: ChatModel;
  disabled: boolean;
  compacting: boolean;
  save: (tokens: number) => Promise<boolean>;
  saveTurnLimit: (turns: number | null) => Promise<boolean>;
  budgetSaving: boolean;
  saveBudget: (tokens: number | null) => Promise<boolean>;
  setAutomatic: (enabled: boolean) => void;
  compact: (focus: string) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{ tokens: number; original: number }>();
  const [focus, setFocus] = useState("");
  const [notice, setNotice] = useState("");
  const tokens = draft?.tokens ?? settings.keepRecentTokens;
  const changed = !!draft && draft.original !== settings.keepRecentTokens;
  const canCompact = !disabled && !compacting && !!settings.modelWindow;
  const nextModel =
    selectedModel &&
    (selectedModel.id !== settings.model?.id ||
      selectedModel.provider !== settings.model.provider)
      ? selectedModel
      : undefined;
  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Model context window</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex min-w-0 flex-col gap-2">
            <div>
              <dt className="text-muted-foreground">Current model</dt>
              <dd className="wrap-anywhere">
                {settings.model ? settings.model.name : "No model saved"}
                {settings.modelWindow
                  ? ` · ${formatTokens(settings.modelWindow)}`
                  : settings.model
                    ? " · limit unavailable"
                    : ""}
              </dd>
            </div>
            {settings.estimatedContextTokens !== undefined && (
              <div>
                <dt className="text-muted-foreground">
                  Estimated active context
                </dt>
                <dd>{formatTokens(settings.estimatedContextTokens)}</dd>
              </div>
            )}
            {nextModel && (
              <div>
                <dt className="text-muted-foreground">
                  Selected for next send
                </dt>
                <dd className="wrap-anywhere">
                  {nextModel.name}
                  {nextModel.contextWindow
                    ? ` · ${formatTokens(nextModel.contextWindow)}`
                    : " · limit unavailable"}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
      {settings.usage !== undefined && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Recorded usage</CardTitle>
            <CardDescription>
              Across all runs in this conversation, including compaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settings.usage ? (
              <dl className="flex flex-col gap-2">
                <div>
                  <dt className="text-muted-foreground">Total tokens</dt>
                  <dd>{formatTokens(settings.usage.tokens)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recorded cost (USD)</dt>
                  <dd>{formatCost.format(settings.usage.cost)}</dd>
                </div>
              </dl>
            ) : (
              "No usage recorded yet."
            )}
          </CardContent>
        </Card>
      )}
      {settings.maxTurns !== undefined && (
        <IntegerLimit
          title="Run limit"
          description="Applies to this conversation. Continue starts a fresh allowance."
          label="Tool rounds per run"
          value={settings.maxTurns}
          disabled={disabled}
          save={saveTurnLimit}
        />
      )}
      {!sessionSettingsHref && settings.tokenBudget !== undefined && (
        <IntegerLimit
          title="Session token budget"
          description={
            settings.sessionTokens === undefined
              ? "Applies to all chats, reviews and compaction in this session."
              : `${formatTokens(settings.sessionTokens)} recorded in this session.`
          }
          label="Stop new model requests at"
          value={settings.tokenBudget}
          disabled={budgetSaving}
          save={saveBudget}
        />
      )}
      {sessionSettingsHref ? (
        <div className="text-sm">
          <p>
            Session budget: {settings.tokenBudget ?? "Unlimited"}. Automatic
            compaction: {settings.automatic ? "Enabled" : "Disabled"}. Recent
            tokens: {settings.keepRecentTokens}.
          </p>
          {openSessionSettings ? (
            <Button variant="link" size="sm" onClick={openSessionSettings}>
              Edit shared session runtime settings
            </Button>
          ) : (
            <Link href={sessionSettingsHref}>
              Edit shared session runtime settings
            </Link>
          )}
        </div>
      ) : (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Compaction settings</CardTitle>
            <CardDescription>
              Shared by every conversation in this session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-3">
              {settings.automatic !== undefined && (
                <Field orientation="horizontal" data-disabled={disabled}>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <FieldLabel htmlFor={`${id}-automatic`}>
                      Automatic compaction
                    </FieldLabel>
                    <FieldDescription id={`${id}-automatic-help`}>
                      Summarize older messages when the model nears its context
                      limit.
                    </FieldDescription>
                  </div>
                  <Switch
                    id={`${id}-automatic`}
                    aria-describedby={`${id}-automatic-help`}
                    size="sm"
                    checked={settings.automatic}
                    disabled={disabled}
                    onCheckedChange={setAutomatic}
                  />
                </Field>
              )}
              <Field data-disabled={disabled} data-invalid={changed}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <span className="font-medium">Recent messages to keep</span>
                  <Badge variant="secondary" className="tabular-nums">
                    {formatTokens(tokens)}
                  </Badge>
                </div>
                <Slider
                  className="my-1"
                  value={[tokens]}
                  min={settings.min}
                  max={settings.max}
                  step={settings.step}
                  disabled={disabled}
                  aria-invalid={changed}
                  aria-describedby={`${id}-retention-help`}
                  thumbProps={{
                    getAriaLabel: () => "Recent messages to keep",
                    getAriaValueText: () => formatTokens(tokens),
                  }}
                  onValueChange={(value) => {
                    if (Array.isArray(value))
                      setDraft({
                        tokens: value[0],
                        original: draft?.original ?? settings.keepRecentTokens,
                      });
                  }}
                />
                <FieldDescription id={`${id}-retention-help`}>
                  Keep this much recent text in full when older messages are
                  summarized.
                </FieldDescription>
                {changed && (
                  <FieldError>
                    The saved size changed elsewhere. Reset the draft to review
                    it.
                  </FieldError>
                )}
              </Field>
            </FieldGroup>
          </CardContent>
          {draft && (tokens !== settings.keepRecentTokens || changed) && (
            <CardFooter className="justify-end gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setDraft(undefined)}
              >
                Reset draft
              </Button>
              <Button
                size="xs"
                disabled={disabled || changed}
                onClick={async () => {
                  if (await save(tokens)) setDraft(undefined);
                }}
              >
                Save size
              </Button>
            </CardFooter>
          )}
        </Card>
      )}
      <Card size="sm">
        <CardHeader>
          <CardTitle>Summarize older messages</CardTitle>
          <CardDescription>
            Free space in the current model’s context. The full transcript stays
            visible.
          </CardDescription>
          {compacting && (
            <CardAction>
              <Badge variant="secondary">Compacting</Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-3">
            <Field data-disabled={!canCompact}>
              <FieldLabel htmlFor={`${id}-focus`}>
                What should the summary preserve? (optional)
              </FieldLabel>
              <Textarea
                id={`${id}-focus`}
                className="max-h-40"
                maxLength={2000}
                disabled={!canCompact}
                value={focus}
                placeholder="For example, keep decisions and next steps."
                onChange={(event) => {
                  setNotice("");
                  setFocus(event.target.value);
                }}
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-2">
          <p role="status" className="min-w-0 flex-1 text-muted-foreground">
            {!settings.modelWindow
              ? "An available model is required."
              : tokens !== settings.keepRecentTokens
                ? "Save the retention size first."
                : compacting
                  ? "Compacting with the current model."
                  : disabled
                    ? "Available when the conversation is idle."
                    : notice}
          </p>
          <Button
            size="xs"
            disabled={!canCompact || tokens !== settings.keepRecentTokens}
            onClick={async () => {
              setNotice("");
              if (await compact(focus)) {
                setFocus("");
                setNotice("Compaction requested.");
              }
            }}
          >
            Compact now
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}

function IntegerLimit({
  title,
  description,
  label,
  value,
  disabled,
  save,
}: {
  title: string;
  description: string;
  label: string;
  value: number | null;
  disabled: boolean;
  save: (value: number | null) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{
    text: string;
    original: number | null;
  }>();
  const text = draft?.text ?? String(value ?? "");
  const limit = text === "" ? null : Number(text);
  const invalid =
    limit !== null &&
    (!/^\d+$/.test(text) || !Number.isSafeInteger(limit) || limit < 1);
  const stale = !!draft && draft.original !== value;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field data-disabled={disabled} data-invalid={invalid || stale}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            id={id}
            inputMode="numeric"
            placeholder="Unlimited"
            value={text}
            aria-invalid={invalid || stale}
            aria-describedby={`${id}-help`}
            disabled={disabled}
            onChange={(event) =>
              setDraft({
                text: event.target.value,
                original: draft ? draft.original : value,
              })
            }
          />
          <FieldDescription id={`${id}-help`}>
            Leave blank for unlimited.
          </FieldDescription>
          {stale ? (
            <FieldError>
              The limit changed elsewhere. Reset your draft.
            </FieldError>
          ) : (
            invalid && <FieldError>Enter a positive whole number.</FieldError>
          )}
        </Field>
      </CardContent>
      {draft && (limit !== value || stale) && (
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={() => setDraft(undefined)}>
            Reset draft
          </Button>
          <Button
            size="xs"
            disabled={disabled || invalid || stale}
            onClick={async () => {
              if (await save(limit)) setDraft(undefined);
            }}
          >
            Save limit
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
