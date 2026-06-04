import { notFound } from "next/navigation";
import { isAdmin } from "@/auth/auth";
import { features } from "@/lib/env";
import { adminStats, listUsersWithUsage } from "@/server/admin";
import { AdminUsers } from "@/components/AdminUsers";

export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

export default async function AdminPage() {
  if (!(await isAdmin())) notFound();

  if (!features.hasDb()) {
    return (
      <div className="card mx-auto max-w-xl bg-amber-50">
        <h2 className="text-lg font-semibold text-amber-800">Database not configured</h2>
        <p className="mt-2 text-sm text-amber-700">
          The admin dashboard needs Firestore. Configure a Google service account to enable it.
        </p>
      </div>
    );
  }

  const [stats, users] = await Promise.all([adminStats(), listUsersWithUsage()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-1 text-sm text-slate-500">Usage overview and user management.</p>
      </div>

      <section aria-label="Summary statistics" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Users" value={stats.users} />
        <StatCard label="Songs" value={stats.songs} />
        <StatCard label="Projects" value={stats.projects} />
        <StatCard label="Songs today" value={stats.songsToday} />
        <StatCard label="Jobs running" value={stats.jobsRunning} />
      </section>

      <section aria-label="Users" className="space-y-3">
        <h2 className="text-lg font-semibold">Users</h2>
        <AdminUsers initial={users} />
      </section>
    </div>
  );
}
