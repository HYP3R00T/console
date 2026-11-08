import { Suspense } from "react";
import { PreferencesHub } from "@/components/settings/preferences-hub";
export default function Settings() {
  return (
    <Suspense fallback={<p role="status">Loading preferences…</p>}>
      <PreferencesHub />
    </Suspense>
  );
}
