import {
  applyFields,
  fieldError,
  fieldValue,
  modelFields,
  modelPolicies,
  policyGroups,
  type RuntimePolicy,
  setModelPolicy,
} from "../components/sessions/runtime-policy-form.ts";

export type RuntimePolicyDraft = {
  original: string;
  base: RuntimePolicy;
  values: Record<string, string>;
  models: RuntimePolicy;
  reset?: boolean;
};
const fields = policyGroups.flatMap((group) => group.fields);
export function resetRuntimePolicyDraft(
  value: RuntimePolicy,
): RuntimePolicyDraft {
  return {
    original: JSON.stringify(value),
    base: {},
    values: {},
    models: {},
    reset: true,
  };
}
export function runtimePolicyDraftInvalid(
  value: RuntimePolicy,
  draft?: RuntimePolicyDraft,
) {
  const base = draft?.base ?? value;
  return (
    fields.some(
      (field) =>
        !!fieldError(
          field,
          draft?.values[field.key] ?? fieldValue(base, field.key),
        ),
    ) ||
    Object.values(draft?.models ?? modelPolicies(value)).some(
      (policy) =>
        typeof policy === "object" &&
        modelFields.some(
          (field) => !!fieldError(field, fieldValue(policy, field.key)),
        ),
    )
  );
}
export function runtimePolicyDraftValue(
  draft: RuntimePolicyDraft,
): RuntimePolicy | null {
  let next = applyFields(draft.base, fields, draft.values);
  for (const key of Object.keys(modelPolicies(next)))
    next = setModelPolicy(next, key, null);
  for (const [key, policy] of Object.entries(draft.models))
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
  return draft.reset && Object.keys(next).length === 0 ? null : next;
}
