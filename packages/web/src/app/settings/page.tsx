import Link from "next/link";
import { ProviderSettings } from "@/components/provider-settings";
export default function Settings() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/" className="text-sm underline">
        Back to work sessions
      </Link>
      <ProviderSettings />
    </main>
  );
}
