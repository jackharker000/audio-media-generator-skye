import { notFound } from "next/navigation";
import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import { getMySettings, getProjectDetail } from "@/server/service";
import { NotebookClient } from "@/components/NotebookClient";
import { ProjectActions } from "@/components/ProjectActions";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  if (!features.hasDb()) return <SetupNotice />;
  const userId = await requireUserPage();
  const { id } = await params;
  const settings = await getMySettings(userId);

  let detail: Awaited<ReturnType<typeof getProjectDetail>>;
  try {
    detail = await getProjectDetail(userId, id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{detail.project.title}</h1>
          {detail.project.description && (
            <p className="text-sm text-slate-600">{detail.project.description}</p>
          )}
        </div>
        <ProjectActions projectId={id} />
      </div>
      <NotebookClient
        projectId={id}
        defaultFocus={detail.project.focusPromptDefault ?? undefined}
        defaultGenre={settings.defaultGenre ?? undefined}
        defaultVoiceGender={settings.defaultVoiceGender ?? undefined}
        activeJobId={
          detail.jobs.find((j) => j.status === "queued" || j.status === "running")?.id ?? null
        }
        initialSources={detail.sources.map((s) => ({
          id: s.id,
          filename: s.filename,
          kind: s.kind,
          status: s.status,
        }))}
        songs={detail.songs.map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: new Date(s.createdAt).toISOString(),
        }))}
      />
    </div>
  );
}
