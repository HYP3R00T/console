import type { AgentConfiguration, Provider } from "../api.ts";
export function visibleModelGroups(
  providers: Provider[],
  preferred: string[],
  current?: AgentConfiguration,
  opened?: AgentConfiguration,
) {
  return providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter(
        (model) =>
          preferred.includes(`${provider.id}/${model.id}`) ||
          (current?.provider === provider.id && current.model === model.id) ||
          (opened?.provider === provider.id && opened.model === model.id),
      ),
    }))
    .filter((provider) => provider.models.length);
}
