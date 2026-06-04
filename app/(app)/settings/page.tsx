import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import { getMySettings } from "@/server/service";
import { SettingsClient } from "@/components/SettingsClient";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!features.hasDb()) return <SetupNotice />;
  const userId = await requireUserPage();
  const settings = await getMySettings(userId);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsClient initial={settings} />
    </div>
  );
}
