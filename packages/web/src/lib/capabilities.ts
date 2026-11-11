import {
  modelFields,
  policyGroups,
} from "../components/sessions/runtime-policy-form.ts";
import type { CommandId } from "./commands.ts";
import { themeTokens } from "./configuration/theme-schema.ts";

export type CapabilityScope =
  | "client"
  | "machine"
  | "project"
  | "session"
  | "conversation"
  | "work";
export type CapabilityKind = "setting" | "action" | "information";
export type Capability = {
  id: string;
  label: string;
  description: string;
  scope: CapabilityScope;
  kind: CapabilityKind;
  location: string;
  effect: string;
  command?: CommandId;
  input?: { destination: string };
};
type Entry = [
  key: string,
  label: string,
  description: string,
  kind?: CapabilityKind,
];
function group(
  scope: CapabilityScope,
  prefix: string,
  location: string,
  effect: string,
  command: CommandId | undefined,
  entries: Entry[],
  input?: { destination: string },
): Capability[] {
  return entries.map(([key, label, description, kind = "setting"]) => ({
    id: `${prefix}.${key}`,
    scope,
    location,
    effect,
    command,
    input,
    label,
    description,
    kind,
  }));
}
export const capabilities: Capability[] = [
  ...group(
    "client",
    "appearance",
    "Preferences → Appearance",
    "Saved in this browser. Other clients and backend settings are unchanged.",
    "preferences.appearance",
    [
      [
        "mode",
        "Display mode",
        "System, Light or Dark; System follows your device.",
      ],
      [
        "lightTheme",
        "Default light theme",
        "Used whenever light mode is active.",
      ],
      ["darkTheme", "Default dark theme", "Used whenever dark mode is active."],
      [
        "import",
        "Import theme",
        "Validate token-based JSON; no scripts or arbitrary stylesheets.",
        "action",
      ],
      [
        "download",
        "Download theme",
        "Export one theme as a portable editing starting point.",
        "action",
      ],
      [
        "colors",
        "Inspect theme colors",
        "See every supported color role and value.",
        "information",
      ],
    ],
  ),
  ...group(
    "client",
    "theme.token",
    "Preferences → Appearance → All colors",
    "Theme JSON roles; imported definitions are browser-owned, not individual backend settings.",
    "preferences.appearance",
    themeTokens.map((token) => [
      token,
      `Theme color: ${token}`,
      "Inspect or export this token; edit a downloaded theme and import it to customize.",
    ]),
  ),
  ...group(
    "client",
    "shortcuts",
    "Preferences → Keyboard shortcuts",
    "One browser’s bindings work across its connected backends. New commands have no automatic binding.",
    "preferences.shortcuts",
    [
      [
        "change",
        "Change keybinding",
        "Record and validate a command binding.",
        "action",
      ],
      [
        "add",
        "Add alternative binding",
        "Assign another shortcut to the same stable command ID.",
        "action",
      ],
      [
        "remove",
        "Remove keybinding",
        "Remove the selected binding, not the command.",
        "action",
      ],
      [
        "reset",
        "Reset keybindings",
        "Restore a command’s built-in bindings.",
        "action",
      ],
      [
        "copy",
        "Copy command or shortcut",
        "Copy its ID, title or binding through row actions.",
        "action",
      ],
    ],
  ),
  ...group(
    "client",
    "backup",
    "Preferences → Backup/Restore",
    "Replaces exported client categories only. Credentials, transcripts, active connections and temporary drafts are excluded.",
    "preferences.configuration",
    [
      [
        "export",
        "Export backup",
        "Download current client preferences, shortcuts, themes, bookmarks, pins and navigation.",
        "action",
      ],
      [
        "import",
        "Import and preview backup",
        "Validate the complete JSON before applying anything.",
        "action",
      ],
      [
        "restore",
        "Restore backup",
        "Confirm replacement; imported bookmarks do not automatically connect or establish trust.",
        "action",
      ],
      [
        "undo",
        "Undo restore",
        "Restore the preceding client configuration.",
        "action",
      ],
    ],
  ),
  ...group(
    "client",
    "connections",
    "Manage machines",
    "Bookmarks are browser-owned. Connecting does not install, delete or move a backend.",
    "navigation.devices",
    [
      [
        "name",
        "Machine bookmark name",
        "A personal label for the destination.",
      ],
      ["url", "Backend URL", "Saved address of a supported Console backend."],
      ["icon", "Machine bookmark icon", "Personal navigation appearance."],
      ["color", "Machine bookmark color", "Personal navigation appearance."],
      [
        "identity",
        "Verified backend identity",
        "Connection metadata, not an arbitrary editable label.",
        "information",
      ],
      [
        "connect",
        "Connect machine",
        "Connect explicitly to the bookmarked installation.",
        "action",
      ],
      [
        "disconnect",
        "Disconnect or cancel connection",
        "Close or cancel this browser’s connection.",
        "action",
      ],
      [
        "forget",
        "Forget machine",
        "Remove the bookmark without deleting backend data.",
        "action",
      ],
    ],
  ),
  ...group(
    "client",
    "navigation",
    "Workspace navigation and layout",
    "Personal presentation state; not instructions or permissions for the agent.",
    undefined,
    [
      [
        "projectPins",
        "Project pins",
        "Pin or unpin through the project navigation menu.",
      ],
      [
        "conversationPins",
        "Conversation pins",
        "Pin or unpin through the conversation navigation menu.",
      ],
      [
        "disclosures",
        "Expanded navigation groups",
        "Remember expanded Client, Machine, project and recent groups.",
      ],
      [
        "routes",
        "Recent destinations",
        "Remember bounded recent workspace routes.",
      ],
      [
        "inspector",
        "Last sidebar scope and section",
        "Remember the selected control destination for each conversation.",
      ],
      [
        "width",
        "Sidebar width",
        "Resize using the divider; retained during the current app lifetime.",
      ],
    ],
  ),
  ...group(
    "client",
    "layout",
    "Workspace bottom bar",
    "Client layout only.",
    "workspace.navigation",
    [
      [
        "left",
        "Show or hide left sidebar",
        "Toggle workspace navigation.",
        "action",
      ],
    ],
  ),
  ...group(
    "client",
    "layout",
    "Workspace bottom bar",
    "Client layout only.",
    "workspace.details",
    [
      [
        "right",
        "Show or hide right sidebar",
        "Toggle the current conversation inspector.",
        "action",
      ],
    ],
  ),
  ...group(
    "machine",
    "providers",
    "Preferences → Machine → Providers",
    "Stored on the selected backend. Secrets are not part of client backups.",
    "machine.providers",
    [
      [
        "login",
        "Provider authentication",
        "API-key or supported OAuth/device login.",
        "action",
      ],
      [
        "cancel",
        "Cancel provider login",
        "Cancel an unfinished authentication flow.",
        "action",
      ],
      [
        "enabled",
        "Enabled providers",
        "Choose which configured providers participate in model selection.",
      ],
      [
        "remove",
        "Remove provider",
        "Remove its saved credentials and favorites through its management controls.",
        "action",
      ],
      [
        "favorites",
        "Model favorites",
        "Choose models offered by composer and defaults pickers.",
      ],
      [
        "refresh",
        "Refresh provider model catalog",
        "Read updated catalog metadata.",
        "action",
      ],
      [
        "metadata",
        "Model limits, capabilities and catalog pricing",
        "Read-only context/output limits, input types, reasoning support and prices.",
        "information",
      ],
    ],
  ),
  ...group(
    "machine",
    "defaults",
    "Preferences → Machine → Runtime defaults",
    "Copied into new conversations; existing conversations keep their saved configuration.",
    "machine.runtime",
    [
      [
        "model",
        "New-conversation default model",
        "Select a favorite from an enabled provider, or clear the default.",
      ],
      [
        "thinking",
        "Default thinking level",
        "A model-supported reasoning effort; distinct from Plan mode.",
      ],
    ],
  ),
  ...group(
    "machine",
    "guidance",
    "Preferences → Machine → Workspace guidance",
    "Shared across this backend’s projects and conversations. Blank restores built-in guidance.",
    "machine.workspace-guidance.update",
    [
      [
        "workspaceGuidance",
        "Machine workspace guidance",
        "General guidance about inspecting and using the workspace.",
      ],
    ],
  ),
  ...group(
    "machine",
    "projectsRoot",
    "Preferences → Machine → Projects folder",
    "A default for future create/clone operations. Existing projects are not moved.",
    "machine.projects",
    [
      [
        "path",
        "Default projects folder",
        "Choose the backend directory for new project folders.",
      ],
    ],
  ),
  ...["reviewer", "agent"].flatMap((kind) =>
    group(
      "machine",
      `${kind}Profile`,
      `Preferences → Machine → ${kind === "reviewer" ? "Reviewer" : "Agent"} profiles`,
      "Reusable creation defaults. Existing agents and scheduled work retain their captured settings.",
      "settings.open",
      [
        ["name", `${kind} profile name`, "Identify a reusable role."],
        ["model", `${kind} profile model`, "Provider and model ID."],
        [
          "thinkingLevel",
          `${kind} profile thinking level`,
          "Supported effort for the selected model.",
        ],
        [
          "instructions",
          `${kind} profile instructions`,
          "Guidance captured when the role is used.",
        ],
        [
          "maxTurns",
          `${kind} profile turn limit`,
          "Bound work performed by the role.",
        ],
        ...(kind === "reviewer"
          ? [
              [
                "passes",
                "Review profile passes",
                "Bounded review passes.",
              ] as Entry,
            ]
          : [
              [
                "tools",
                "Agent profile tools",
                "Explicit tools for future background work.",
              ] as Entry,
            ]),
        [
          "lifecycle",
          `Add or remove ${kind} profile`,
          "Manage reusable roles.",
          "action",
        ],
      ],
      {
        destination: `machine:${kind === "reviewer" ? "reviewers" : "agents"}`,
      },
    ),
  ),
  ...group(
    "machine",
    "mcp",
    "Preferences → Machine → MCP servers",
    "Shared stdio server definitions. Saving reloads connections and can interrupt calls; conversation access is selected separately.",
    "settings.open",
    [
      ["name", "MCP server name", "Stable local server identity."],
      ["command", "MCP executable", "Absolute command path on the backend."],
      [
        "args",
        "MCP arguments",
        "Separate arguments; spaces do not split an argument.",
      ],
      [
        "env",
        "MCP environment variable names",
        "Names of existing backend environment variables, not secret values.",
      ],
      [
        "tools",
        "MCP tool allowlist",
        "Omitted means catalog allowed; an empty list allows no tools.",
      ],
      [
        "lifecycle",
        "Add, edit or remove MCP server",
        "Stage definitions, then Save and reload.",
        "action",
      ],
    ],
    { destination: "machine:mcp" },
  ),
  ...group(
    "machine",
    "ssh",
    "Preferences → Machine → SSH workspaces",
    "Shared destination definitions; keys and host verification files stay on the backend.",
    "settings.open",
    [
      ["name", "SSH profile name", "Stable destination identity."],
      ["host", "SSH host", "Remote hostname."],
      ["user", "SSH user", "Optional remote user."],
      ["port", "SSH port", "Optional SSH port."],
      [
        "cwd",
        "Remote workspace directory",
        "Absolute POSIX path on the remote machine.",
      ],
      ["hostKeyAlias", "SSH host-key alias", "Identity used for verification."],
      [
        "knownHostsFile",
        "SSH known-hosts file",
        "Absolute path on the backend.",
      ],
      [
        "identityFile",
        "SSH private-key file",
        "Optional absolute backend path; key contents are not loaded into the editor.",
      ],
      [
        "lifecycle",
        "Add, edit or remove SSH workspace",
        "Stage definitions, then Save and reload.",
        "action",
      ],
    ],
    { destination: "machine:ssh" },
  ),
  ...group(
    "machine",
    "extensions",
    "Preferences → Machine → Extensions",
    "Owner-provisioned trusted code. Installation makes definitions available; selection for a conversation is separate.",
    "settings.open",
    [
      [
        "name",
        "Extension exported name",
        "Stable user.* identity matching the bundle.",
      ],
      [
        "module",
        "Extension bundle filename",
        "Owner-only self-contained .mjs module.",
      ],
      ["sha256", "Extension pinned hash", "Pin the verified bundle bytes."],
      [
        "available",
        "Available extension bundles",
        "Inspect eligible owner-provisioned files without executing them.",
        "information",
      ],
      [
        "install",
        "Install, replace or remove extension",
        "Build an installation draft; Save and activate executes trusted factories.",
        "action",
      ],
      [
        "reload",
        "Reload saved extensions",
        "Revalidate saved definitions for recovery.",
        "action",
      ],
      [
        "active",
        "Active extension tools and task versions",
        "Inspect active code separately from the saved manifest.",
        "information",
      ],
    ],
    { destination: "machine:extensions" },
  ),
  ...group(
    "project",
    "project",
    "Right sidebar → Project",
    "Backend-owned project context. Lifecycle operations remain in navigation, not customization forms.",
    "project.agent-settings.update",
    [
      ["name", "Project name", "Shared project identity."],
      ["icon", "Project icon", "Shared project appearance."],
      ["color", "Project color", "Shared project appearance."],
      [
        "directory",
        "Project directory and availability",
        "Read-only location and accessibility status in the inspector.",
        "information",
      ],
      [
        "projectInstructions",
        "Shared project instructions",
        "Applies across existing project conversations; separate from AGENTS.md.",
      ],
      [
        "inspectionGuidance",
        "Project evidence rules",
        "Shared guidance for supporting claims; blank restores the built-in guidance.",
      ],
      [
        "projectTools",
        "Default tools for new conversations",
        "Copied at creation. Null uses built-in defaults; an empty list selects no tools.",
      ],
      [
        "git",
        "Project branch and worktree metadata",
        "Inspect branches, current checkout, repository root and worktree status. These lists do not switch branches.",
        "information",
      ],
    ],
  ),
  ...group(
    "session",
    "session",
    "Right sidebar → Session",
    "Shared by session conversations and owned workers. Budget can change during work; compaction and policies require session idle.",
    "inspector.session",
    [
      [
        "tokenBudget",
        "Session token budget",
        "Stop new requests at a recorded token threshold; blank removes the limit. In-flight work may overshoot.",
      ],
      [
        "automaticCompaction",
        "Automatic compaction",
        "Allow automatic context summarization.",
      ],
      [
        "keepRecentTokens",
        "Recent tokens to retain",
        "Keep recent context in full during compaction.",
      ],
      ...policyGroups.flatMap((group) =>
        group.fields.map(
          (field) =>
            [
              field.key,
              field.label,
              `${group.title}. Blank or Default inherits backend policy.`,
            ] as Entry,
        ),
      ),
      ...modelFields.map(
        (field) =>
          [
            `modelOverrides.${field.key}`,
            `Per-model: ${field.label}`,
            "Override session compaction for an exact provider/model identifier.",
          ] as Entry,
      ),
      [
        "modelOverrides.identity",
        "Per-model compaction identity",
        "Add or remove an exact provider/model-id override.",
      ],
      [
        "reset",
        "Restore execution policy defaults",
        "Stage removal of policy overrides, then Save changes.",
        "action",
      ],
    ],
  ),
  ...group(
    "conversation",
    "conversation",
    "Right sidebar → Behavior & tool access",
    "One conversation. Backend-confirmed changes; most changes require an idle conversation.",
    "inspector.tools",
    [
      [
        "planMode",
        "Plan mode",
        "Read workspace files and save a proposed plan without editing workspace files. Turn off to implement.",
      ],
      [
        "plan",
        "Saved plan",
        "Inspect a submitted implementation plan.",
        "information",
      ],
      [
        "tools",
        "Conversation tool access",
        "Enable individual tools or restore the default selection.",
      ],
      [
        "toolDetails",
        "Tool descriptions and parameters",
        "Inspect actual tool capabilities and input schemas.",
        "information",
      ],
    ],
  ),
  ...group(
    "conversation",
    "workspace",
    "Right sidebar → Workspace & isolation",
    "Changes where this conversation’s tools and checks run; selection is distinct from machine definitions.",
    "inspector.workspace",
    [
      [
        "worktree",
        "Attached Git worktree",
        "Select an existing checkout, or return to the project directory.",
      ],
      [
        "sandbox",
        "Workspace sandbox",
        "Use supported filesystem/network isolation; does not mean a separate project or conversation.",
      ],
      [
        "remoteProfile",
        "Selected SSH workspace",
        "Choose a configured remote destination or return to local execution. Idle and compatibility restrictions are backend-enforced.",
      ],
      [
        "reload",
        "Reload SSH profiles",
        "Connection maintenance can interrupt shared active calls.",
        "action",
      ],
    ],
  ),
  ...group(
    "conversation",
    "integrations",
    "Right sidebar → Integrations",
    "Access for this conversation, not installation on the machine. Plan/sandbox/remote compatibility remains authoritative.",
    "inspector.integrations",
    [
      [
        "mcp",
        "MCP access",
        "Enable permitted tools from configured backend servers.",
      ],
      [
        "managedExtensions",
        "Selected managed extensions",
        "Select installed tools/hooks; selection does not bypass existing tool restrictions.",
      ],
      [
        "codeMode",
        "Tool scripting / Code Mode",
        "Compose permitted tool calls in sandboxed JavaScript and discover deferred tools.",
      ],
      [
        "status",
        "Integration connection and suspension state",
        "Inspect configured servers, available tool counts, errors and suspended selections.",
        "information",
      ],
      [
        "reconnect",
        "Reconnect MCP servers",
        "Retry disconnected server connections.",
        "action",
      ],
      [
        "reload",
        "Reload MCP configuration",
        "Reread configuration and reload shared connections.",
        "action",
      ],
    ],
  ),
  ...group(
    "conversation",
    "instructions",
    "Right sidebar → Instructions",
    "Conversation instructions are local to the agent; linked project/machine guidance remains shared.",
    "inspector.instructions",
    [
      ["text", "Conversation instructions", "Guidance for this agent."],
      [
        "effective",
        "Effective runtime guidance and permissions",
        "Inspect the rendered instruction/environment context instead of assuming requested values are active.",
        "information",
      ],
    ],
  ),
  ...group(
    "conversation",
    "context",
    "Right sidebar → Context & usage",
    "Separate measured historical usage, estimated active context and shared session budget.",
    "inspector.context",
    [
      [
        "maxTurns",
        "Tool rounds per run",
        "Bound this conversation’s run; blank removes its explicit limit.",
      ],
      [
        "savedModel",
        "Saved conversation model",
        "Provider/model last saved for the conversation.",
        "information",
      ],
      [
        "nextModel",
        "Next-send model",
        "Inspect an unsent composer selection separately from the saved model.",
        "information",
      ],
      [
        "window",
        "Context and output capacity",
        "Read-only model catalog limits.",
        "information",
      ],
      [
        "estimate",
        "Estimated active context",
        "Approximate active context tokens; not a billing total.",
        "information",
      ],
      [
        "usage",
        "Recorded tokens and cost",
        "Measured accumulated usage.",
        "information",
      ],
      [
        "compact",
        "Manual context compaction",
        "Choose what a summary should preserve; transcript history remains available.",
        "action",
      ],
      [
        "session",
        "Shared budget and compaction summary",
        "Open Session to edit shared values rather than duplicate their editors.",
        "information",
      ],
    ],
  ),
  ...group(
    "conversation",
    "checks",
    "Right sidebar → Post-run checks",
    "Conversation-owned checks also apply to supported captured worker workflows.",
    "inspector.checks",
    [
      [
        "postRunCommand",
        "Post-run check command",
        "Run a command after an answered turn.",
      ],
      [
        "postRunRepairLimit",
        "Post-run repair limit",
        "Bound automatic repair attempts after a failing check.",
      ],
    ],
  ),
  ...group(
    "conversation",
    "composer",
    "Conversation composer",
    "Unsaved model/thinking selections apply on the next submitted request, not at picker click time.",
    "composer.model",
    [
      [
        "model",
        "Next-request model",
        "Choose an available favorite provider/model.",
      ],
      [
        "thinking",
        "Next-request thinking level",
        "Choose model-supported effort; not the same as Plan mode.",
      ],
    ],
  ),
  ...group(
    "work",
    "agents",
    "Right sidebar → Background agents",
    "Persistent agents capture configuration when created and share the session budget. Parent Stop leaves them running.",
    "inspector.agents",
    [
      ["name", "Background agent name", "Identify a persistent agent."],
      [
        "profile",
        "Background agent profile",
        "Select a reusable role or inherit current configuration.",
      ],
      [
        "create",
        "Create background agent",
        "Create its conversation without starting work.",
        "action",
      ],
      [
        "message",
        "Send background agent request",
        "Assign instructions to the selected agent.",
        "action",
      ],
      [
        "whenBusy",
        "Agent steering or follow-up",
        "Choose request delivery while that agent is busy.",
      ],
      [
        "delivery",
        "Agent result delivery",
        "Display, add to parent context, or deliver as follow-up.",
      ],
      [
        "inspect",
        "Inspect agent transcript and state",
        "Read its progress and results.",
        "information",
      ],
      [
        "stop",
        "Stop background agent",
        "Stop this agent’s active and queued work.",
        "action",
      ],
    ],
  ),
  ...group(
    "work",
    "job",
    "Right sidebar → Schedule job",
    "Admission captures configuration/profile and workspace policy; future profile edits do not rewrite admitted work.",
    "inspector.job",
    [
      ["content", "Job instructions", "Work for a separate worker."],
      [
        "profileId",
        "Job agent profile",
        "Use a role or inherit the conversation configuration.",
      ],
      ["at", "Job start time", "Run now or schedule a time."],
      ["occurrences", "Total job runs", "Bound recurrence count."],
      [
        "intervalMs",
        "Job repeat interval",
        "Time between repeated occurrences.",
      ],
      ["delivery", "Job result delivery", "Display, Context or Follow up."],
      ["schedule", "Schedule job", "Create a bounded schedule.", "action"],
    ],
  ),
  ...group(
    "work",
    "review",
    "Right sidebar → Schedule review",
    "Read-only review configuration captured for admitted work, with session budget and workspace rules.",
    "inspector.review",
    [
      ["brief", "Review brief", "Explain what should be reviewed."],
      [
        "worktree",
        "Review execution workspace",
        "Use an existing linked checkout when supported.",
      ],
      [
        "modelSource",
        "Reviewer model source",
        "Current chat, explicit model/thinking or saved profile.",
      ],
      ["maxTurns", "Review turn limit", "Bound each review run."],
      ["passes", "Review passes", "Bound passes per review."],
      ["at", "Review start time", "Run now or later."],
      ["occurrences", "Total reviews", "Bound repeated reviews."],
      ["intervalMs", "Review repeat interval", "Time between occurrences."],
      ["delivery", "Review result delivery", "Display, Context or Follow up."],
      [
        "schedule",
        "Schedule review",
        "Create the selected bounded review operation.",
        "action",
      ],
    ],
  ),
  ...group(
    "work",
    "tasks",
    "Right sidebar → Automation / Task history & recovery",
    "Actions target specific work, not the whole workspace. Previous external effects can remain after retries.",
    "inspector.history",
    [
      [
        "active",
        "Inspect active work",
        "See tasks, schedules and execution status.",
        "information",
      ],
      [
        "cancel",
        "Cancel scheduled work",
        "Cancel eligible pending/recurring jobs or reviews.",
        "action",
      ],
      [
        "history",
        "Task receipts and diagnostics",
        "Inspect terminal outcomes, identities, attempts and recovery options.",
        "information",
      ],
      [
        "retryJob",
        "Retry eligible job",
        "Acknowledge prior effects before one supported replacement.",
        "action",
      ],
      [
        "retryReview",
        "Retry eligible review",
        "Start the supported recovery attempt.",
        "action",
      ],
      [
        "recheck",
        "Recheck an eligible failed check",
        "Acknowledge effects before starting the supported check-recovery flow.",
        "action",
      ],
    ],
  ),
  ...group(
    "conversation",
    "status",
    "Right sidebar → Effective status",
    "Read-only confirmed backend state; commands express intent, not success.",
    "inspector.status",
    [
      [
        "execution",
        "Execution status and failure",
        "Inspect running, queued, stopped and unsuccessful work.",
        "information",
      ],
      [
        "configuration",
        "Effective configuration",
        "Inspect saved model, workspace, modes and integration selection.",
        "information",
      ],
      [
        "identities",
        "Diagnostic identities and revisions",
        "Read-only backend identifiers for diagnosis; not editable preferences.",
        "information",
      ],
    ],
  ),
  ...group(
    "conversation",
    "message",
    "Composer and message actions",
    "Submission and navigation actions are distinct from configuration.",
    undefined,
    [
      [
        "send",
        "Send message and attachments",
        "Submit text, supported files and images.",
        "action",
      ],
      [
        "removeAttachment",
        "Remove pending attachment",
        "Remove an attachment before submission.",
        "action",
      ],
      ["steer", "Steer current work", "Deliver steering input.", "action"],
      ["followUp", "Queue follow-up", "Queue another request.", "action"],
      [
        "queueEdit",
        "Edit queued input",
        "Change unsent content/delivery with stale-write protection.",
        "action",
      ],
      [
        "withdraw",
        "Withdraw queued input",
        "Remove a queued request.",
        "action",
      ],
      [
        "retrySubmission",
        "Retry ambiguous submission",
        "Reuse its identity to avoid duplicate requests.",
        "action",
      ],
      [
        "earlier",
        "Load earlier or missing history",
        "Retrieve transcript boundaries without replacing newer messages.",
        "action",
      ],
      [
        "latest",
        "Jump to latest activity",
        "Resume following the conversation.",
        "action",
      ],
    ],
  ),
  ...group(
    "conversation",
    "fork",
    "Message action / Fork picker",
    "Creates a conversation in the same session at an explicit history point. It does not create an isolated filesystem.",
    "conversation.fork",
    [
      [
        "at",
        "Fork conversation",
        "Choose a message explicitly, then create a branch.",
        "action",
      ],
    ],
  ),
  ...group(
    "conversation",
    "run",
    "Composer / execution status",
    "Targets the current conversation, not every persistent background agent.",
    "conversation.stop",
    [["stop", "Stop conversation", "Stop active or queued work.", "action"]],
  ),
  ...group(
    "conversation",
    "run",
    "Failure / recovery status",
    "Only an eligible unsuccessful idle run can continue.",
    "conversation.continue",
    [
      [
        "continue",
        "Continue eligible run",
        "Use supported runtime recovery without appending a new request.",
        "action",
      ],
    ],
  ),
  ...group(
    "project",
    "lifecycle",
    "Project navigation menu",
    "Project archive preserves source files. Pinning is browser-owned; lifecycle data is backend-owned.",
    undefined,
    [
      [
        "register",
        "Register existing project",
        "Add a named existing backend directory.",
        "action",
      ],
      [
        "create",
        "Create project",
        "Choose name, folder and whether missing parent folders may be created.",
        "action",
      ],
      [
        "clone",
        "Clone project",
        "Choose repository, name, destination and parent-folder creation.",
        "action",
      ],
      [
        "session",
        "New session",
        "Create a new shared runtime boundary.",
        "action",
      ],
      [
        "conversation",
        "New project conversation",
        "Open a draft; create backend state on first send.",
        "action",
      ],
      [
        "archive",
        "Archive project",
        "Archive project records; stop active work first when required.",
        "action",
      ],
    ],
  ),
  ...group(
    "conversation",
    "conversationMenu",
    "Conversation navigation menu",
    "Entity lifecycle actions do not belong in customization forms.",
    undefined,
    [
      ["rename", "Rename conversation", "Change its backend label.", "action"],
      [
        "archive",
        "Archive conversation",
        "Remove from active navigation while retaining recovery.",
        "action",
      ],
    ],
  ),
  ...group(
    "machine",
    "archives",
    "Preferences → Machine → Archives",
    "Recovery and confirmed irreversible deletion belong in a dedicated management surface.",
    "machine.archives",
    [
      [
        "restoreProject",
        "Restore archived project",
        "Return archived project records to active use.",
        "action",
      ],
      [
        "restoreConversation",
        "Restore archived conversation",
        "Recover an eligible archived conversation.",
        "action",
      ],
      [
        "delete",
        "Permanently delete archived conversation",
        "Confirmation and surviving-dependant restrictions apply.",
        "action",
      ],
      [
        "bulk",
        "Delete selected archived conversations",
        "Confirm explicit eligible histories; report partial failures.",
        "action",
      ],
    ],
  ),
];
export function searchCapabilities(query: string, scope?: CapabilityScope) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return capabilities.filter(
    (item) =>
      (!scope || item.scope === scope) &&
      terms.every((term) =>
        `${item.id} ${item.label} ${item.description} ${item.location} ${item.effect}`
          .toLowerCase()
          .includes(term),
      ),
  );
}
