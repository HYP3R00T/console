import type { ProviderModel } from "@/lib/providers";

export function ModelDetails({ model }: { model: ProviderModel }) {
  return (
    <div className="space-y-5 pb-6 pl-11 pr-4 pt-2">
      <section aria-label="Model limits" className="max-w-2xl">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Limits
        </h3>
        <dl className="grid grid-cols-2 gap-4">
          {(
            [
              ["Context window", model.contextWindow],
              ["Maximum output", model.maxTokens],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-lg font-medium tabular-nums">
                {value.toLocaleString()}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  tokens
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Model capabilities" className="max-w-2xl">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Capabilities
        </h3>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Thinking levels</dt>
            <dd className="mt-1">
              {model.reasoning
                ? model.thinkingLevels.join(", ")
                : "No reasoning support"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Accepted inputs</dt>
            <dd className="mt-1">{model.input.join(", ")}</dd>
          </div>
        </dl>
      </section>
      <section aria-label="Model catalog pricing" className="max-w-2xl">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Catalog pricing · USD per 1M tokens
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {(
            [
              ["Input", model.cost.input],
              ["Output", model.cost.output],
              ["Cache read", model.cost.cacheRead],
              ["Cache write", model.cost.cacheWrite],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-medium tabular-nums">${value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-xs text-muted-foreground">
        {model.available
          ? model.favorite
            ? "Selected for the future chat picker."
            : "Star to include in the future chat picker."
          : "Unavailable from this provider; excluded from the future chat picker."}
      </p>
    </div>
  );
}
