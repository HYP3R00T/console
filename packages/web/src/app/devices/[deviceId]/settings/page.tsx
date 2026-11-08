import { redirect } from "next/navigation";
import { preferencesHref } from "@/lib/preferences-navigation";

export default async function DeviceSettings({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  redirect(preferencesHref({ deviceId }));
}
