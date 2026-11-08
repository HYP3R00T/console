import { notFound } from "next/navigation";
import { MachinePreferenceLanding } from "@/components/settings/machine-preference-landing";
import { machinePreferencePages } from "@/lib/preferences-navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const page = machinePreferencePages.find((page) => page.id === category);
  if (!page) notFound();
  return <MachinePreferenceLanding category={page.id} label={page.label} />;
}
