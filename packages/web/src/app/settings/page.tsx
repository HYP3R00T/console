import { redirect } from "next/navigation";
import {
  preferencesHref,
  preferenceTarget,
} from "@/lib/preferences-navigation";

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  const target = preferenceTarget(
    {},
    {
      get: (key) => {
        const value = search[key];
        return (Array.isArray(value) ? value[0] : value) ?? null;
      },
    },
  );
  redirect(preferencesHref(target));
}
