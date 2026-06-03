import Link from "next/link";
import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import { listProjects } from "@/server/service";
import { CreateProject } from "@/components/CreateProject";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!features.hasDb()) return <SetupNotice />;
  const userId = await requireUserPage();
  const projects = await listProjects(userId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your notebooks</h1>
      <CreateProject />

      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">No notebooks yet — create one above.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="card block hover:border-brand-300">
                <h3 className="font-semibold">{p.title}</h3>
                {p.description && <p className="mt-1 text-sm text-slate-600">{p.description}</p>}
                <p className="mt-2 text-xs text-slate-400">
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
