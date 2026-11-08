"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
export function SettingsScopeNav() {
  const pathname = usePathname();
  const { deviceId, projectId, sessionId, conversationId } = useParams<{
    deviceId?: string;
    projectId?: string;
    sessionId?: string;
    conversationId?: string;
  }>();
  if (!pathname.includes("/settings")) return null;
  const machine = deviceId
    ? `/devices/${encodeURIComponent(deviceId)}`
    : undefined;
  const links = [
    { label: "Client", href: "/settings/appearance" },
    ...(machine
      ? [{ label: "Machine", href: `${machine}/settings/runtime` }]
      : []),
    ...(machine && projectId
      ? [
          {
            label: "Project",
            href: `${machine}/projects/${encodeURIComponent(projectId)}/settings`,
          },
        ]
      : []),
    ...(machine && sessionId
      ? [
          {
            label: "Session",
            href: `${machine}/sessions/${encodeURIComponent(sessionId)}/settings`,
          },
        ]
      : []),
    ...(machine && sessionId && conversationId
      ? [
          {
            label: "Conversation",
            href: `${machine}/conversations/${encodeURIComponent(sessionId)}/${encodeURIComponent(conversationId)}`,
          },
        ]
      : []),
  ];
  return (
    <nav
      aria-label="Settings ownership scopes"
      className="mb-5 flex flex-wrap gap-4 border-b pb-3 text-sm"
    >
      {links.map((link) => (
        <Link key={link.label} href={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
