import type { BackendClient } from "./backend/client.ts";
import type { Device } from "./devices.ts";
import {
  conversationHref,
  type PaletteDestination,
  type PaletteTarget,
  targetKey,
} from "./palette-navigation.ts";

type Project = { id: string; name: string; available: boolean };
type SessionRecord = {
  sessionId: string;
  projectId: string;
  number: number;
  name: string;
};
type Session = {
  session: SessionRecord;
  conversations: { id: number; name: string }[];
  more: boolean;
};
export type PaletteCatalog = {
  destinations: PaletteDestination[];
  errors: string[];
  more: boolean;
};

/** Bound API concurrency; listing metadata never loads messages or changes backend state. */
async function mapBounded<T, R>(items: T[], load: (item: T) => Promise<R>) {
  let cursor = 0;
  const result: PromiseSettledResult<R>[] = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          result[index] = {
            status: "fulfilled",
            value: await load(items[index]),
          };
        } catch (reason) {
          result[index] = { status: "rejected", reason };
        }
      }
    }),
  );
  return result;
}
export async function loadPaletteCatalog(
  device: Device,
  client: Pick<BackendClient, "request">,
  signal: AbortSignal,
): Promise<PaletteCatalog> {
  const destinations: PaletteDestination[] = [],
    errors: string[] = [];
  let more = false;
  const request = <T>(path: string) => {
    if (signal.aborted) return Promise.reject(new Error("Cancelled"));
    return client.request<T>(path, { signal });
  };
  const result = await Promise.allSettled([
    request<{ projects: Project[] }>("/v1/projects"),
    request<{ sessions: (SessionRecord & { conversationId: number })[] }>(
      "/v1/standalone",
    ),
  ]);
  const projects =
    result[0].status === "fulfilled" ? result[0].value.projects : [];
  function add(
    kind: PaletteDestination["kind"],
    label: string,
    target: PaletteTarget,
    path: string[],
    href?: string,
    disabled?: string,
  ) {
    destinations.push({
      id: targetKey(target),
      kind,
      label,
      target,
      path,
      href,
      disabled,
    });
  }
  function conversation(
    session: SessionRecord,
    id: number,
    name: string,
    project?: Project,
  ) {
    const target = {
      deviceId: device.id,
      projectId: project?.id,
      sessionId: session.sessionId,
      conversationId: String(id),
    };
    add(
      "conversation",
      name,
      target,
      [
        device.name,
        ...(project ? [project.name] : []),
        `Session ${session.number}`,
        name,
      ],
      conversationHref(target),
    );
  }
  if (result[1].status === "fulfilled") {
    const sessions = new Set<string>();
    for (const record of result[1].value.sessions) {
      if (!sessions.has(record.sessionId)) {
        sessions.add(record.sessionId);
        add(
          "session",
          `Session ${record.number}`,
          { deviceId: device.id, sessionId: record.sessionId },
          [device.name, `Session ${record.number}`],
        );
      }
      conversation(record, record.conversationId, record.name);
    }
  }
  const sessionLists = await mapBounded(projects, async (project) => {
    add(
      "project",
      project.name,
      { deviceId: device.id, projectId: project.id },
      [device.name, project.name],
      `/devices/${encodeURIComponent(device.id)}/projects/${encodeURIComponent(project.id)}`,
    );
    if (!project.available) return [];
    const data = await request<{ sessions: SessionRecord[] }>(
      `/v1/projects/${encodeURIComponent(project.id)}/sessions`,
    );
    return data.sessions.map((session) => ({ session, project }));
  });
  const sessions = sessionLists.flatMap((item) =>
    item.status === "fulfilled" ? item.value : [],
  );
  const loaded = await mapBounded(sessions, async ({ session, project }) => {
    add(
      "session",
      `Session ${session.number}`,
      {
        deviceId: device.id,
        projectId: project.id,
        sessionId: session.sessionId,
      },
      [device.name, project.name, `Session ${session.number}`],
    );
    const data = await request<Session>(
      `/v1/sessions/${encodeURIComponent(session.sessionId)}/conversations`,
    );
    more ||= data.more;
    for (const row of data.conversations)
      conversation(data.session, row.id, row.name, project);
  });
  for (const item of [...result, ...sessionLists, ...loaded])
    if (item.status === "rejected")
      errors.push(
        item.reason instanceof Error
          ? item.reason.message
          : "Could not load destinations.",
      );
  return {
    destinations: destinations.sort((a, b) =>
      a.path.join(" / ").localeCompare(b.path.join(" / ")),
    ),
    errors: [...new Set(errors)],
    more,
  };
}
