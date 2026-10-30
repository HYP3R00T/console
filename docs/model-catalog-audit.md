# Model catalog audit

Observed on 2026-10-31. These are installed-package and local-machine observations, not
claims about account entitlement or successful inference.

## Missing GPT-6.1 Terra

The installed Pi CLI and Console's installed Pi AI package both report version 1.4.0,
but expose different OpenAI catalogs.

```text
pi --list-models 'gpt-6.1'
provider model          context max-out thinking images
openai   gpt-6.1-sol    272K    128K    yes      yes
openai   gpt-6.1-terra  272K    128K    yes      yes
```

The executable inspected was the mise-managed `pi/1.4.0/pi/pi`. Console's npm package
`@earendil-works/pi-ai@1.4.0/dist/providers/data/openai.json` contains GPT-6.1 Sol and
GPT-5.6 Terra, but no GPT-6.1 Terra. The live machine's connected-provider API publishes
42 OpenAI models with the same omission. Its installed OpenAI provider imports this
static catalog; the frontend is displaying the backend catalog, not filtering out Terra.
No custom Pi CLI `models.json` was found in the checked agent configuration.

The observed cause is catalog disagreement between the two installed distributions.
The source of that distribution discrepancy has not been established. Matching version
strings alone do not prove catalog parity. Resolving it requires a backend dependency/catalog
change, followed by model/provider validation. This frontend change does not invent an
unsupported row, alter the package catalog, or assert that the account can use Terra.
The settings Reload catalog action rereads the machine's published catalog; it does not
update installed Pi packages. Provider refresh remains the existing Pi refresh operation.

## Thinking capabilities

Console uses Pi's `getSupportedThinkingLevels()` projection, rather than assigning a
fixed frontend vocabulary. In the installed OpenAI JSON, GPT-6.1 Sol maps `off` and
`minimal` to null; its supported levels are low, medium, high, xhigh and max. GPT-6 Luna
maps `off` to `none`, and supports off, low, medium, high, xhigh and max.

Therefore Off appears for Luna, and is explained as unavailable for Sol. Models with
only Off have no thinking control. A fixed non-off tier is displayed without an editable
slider. Provider headings and catalog context capacities are shown in both model selection
and settings; only settings exposes every supported thinking label together.

## Verification boundary

Manual browser checks used the connected OpenAI machine without submitting inference or
credentials. They covered Off selection, Sol's required-thinking explanation, provider
headings, context metadata, a content-sized composer trigger (127.25 px for Luna/Low),
and retaining unsent text and model/thinking drafts through settings and Add machine.
Multi-provider fixtures verify separate groups, provider-qualified favorites, equal model
IDs across providers, current/opening selection retention and absent catalog entries.
Live OpenRouter authentication and multiple-machine switching remain unverified.
