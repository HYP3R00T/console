# Managed Durable extensions

Managed extensions are trusted application code with the backend user's full privileges, not sandboxed plugins.
Provision code on the backend; project files and model tool calls cannot install bundles through this workflow.
Machine settings → Extensions lists owner-provisioned bundles, edits the pinned manifest, installs/replaces/removes definitions, and reloads saved definitions for recovery.
Use bundle copies its current hash into a draft; confirm the exported name, then Save and activate.
The active catalog shows hashes, tools and task versions separately from the saved manifest.

## Bundle contract

Create an owner-only `extensions/` directory (`0700`) inside the Console data directory and place self-contained `.mjs` bundles there as owner-only regular files (`0600`).
Filenames start with a lowercase letter and contain lowercase letters, digits and hyphens; bundles are limited to 1 MiB.
Symlinks and group/world-accessible bundles are rejected.

A bundle exports a default factory receiving the installed Durable root API and returning an extension; the factory may be asynchronous.
Its stable name must be `user.<name>`, and every custom task name must start with that extension name followed by a dot.
Tool names use `user_<name>_`, replacing name hyphens with underscores, followed by lowercase letters, digits or underscores (maximum 64 characters total); this namespace keeps transcript results visible after removal.
Use Durable tool wrappers to decorate built-in tools rather than registering conflicting built-in tool names.
Factories should only define code and return definitions: loading or validating a trusted module executes its module body and factory before installation is committed.

```javascript
export default ({ defineExtension, defineTool }) => defineExtension({
  name: "user.example",
  tools: [defineTool({
    name: "user_example_status",
    description: "Report extension status",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => ({ output: [{ type: "text", text: "Ready" }] }),
  })],
});
```

Console imports the exact verified bytes through a data URL, so relative imports are unavailable; bundle dependencies into the file and use the supplied Durable API.
Node built-ins remain available because these are trusted host modules.
Modules must not assume a disposal callback: removal changes the registry, not process resources or effects the module created independently.

## Installation and recovery

- `GET /v1/machine/extensions/candidates` lists up to 128 eligible filenames and their current SHA-256 hashes without executing them.
- `GET /v1/machine/configuration/extensions` returns the manifest revision, saved configuration, active definitions and any startup load problem.
- `PUT /v1/machine/configuration/extensions` takes `revision` and `configuration`, with an `extensions` array of `{name, module, sha256}` records (maximum 32).
- Replacement uses the same stable name and a newly accepted hash; omission removes an extension from the active registry, and an empty array removes all managed definitions.
- `POST /v1/machine/extensions/reload` with `{}` revalidates the saved manifest and hashes, then publishes its definitions to open Harnesses.

The manifest is stored atomically as owner-only `extensions.json`; stale revisions and validation failures leave the previous manifest and definitions intact.
A publication replaces the complete managed set in one registry snapshot per Harness; running calls retain their code and subsequent phases resolve the new definitions.
Installation does not automatically select tools or hooks for conversations.
Task definitions are globally available to the Harness, following Durable's ownership and version rules.

Saved task state and conversation selections are not deleted on removal.
On startup, an invalid manifest or unavailable pinned bundle leaves managed definitions absent and the backend available to diagnose blocked tasks; other built-in functionality remains available.
Restoring the expected bundles and reloading wakes blocked work; outdated definitions remain blocked until a compatible version is installed.
Task input/checkpoint migration belongs in the extension's Durable task definition, and terminal tasks are not resurrected by reinstalling code.
A failed explicit reload retains the definitions already active in that process; inspect the active catalog separately from the saved manifest.

The loader pins each entry bundle, not arbitrary external resources that trusted code may access.
Node caches imported module versions for the lifetime of the backend process; replacing an extension does not unload old module instances.

## Conversation selection

Tools → Managed extensions selects installed extensions for one idle conversation; selecting preserves its existing tool allowlist, and individual tools remain adjustable in the ordinary tool controls.
`PATCH /configuration` accepts `managedExtensions`, an array of installed `user.*` names, as a separate revision-protected update.
Removed definitions remain visible as unavailable selections and can be deselected; restoration resolves their stored names without losing history.
Plan mode suspends managed extensions and restores the selection on exit; change selections outside Plan mode.
Managed selections require local execution without the workspace sandbox, because extension hooks and code run on the backend.
While selected, every answered run executes its configured post-run check, since hooks can change files without a tool call.
Blocked managed tasks link to machine extension settings, where restoring compatible definitions resumes existing work rather than creating a replacement.
