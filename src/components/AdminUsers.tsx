"use client";

import { useState } from "react";
import type { AdminUserRow } from "@/server/admin";

interface RowState {
  disabled: boolean;
  quota: string; // raw input value; empty string = no override
  saving: boolean;
  deleting: boolean;
  error: string | null;
}

function initState(rows: AdminUserRow[]): Record<string, RowState> {
  const out: Record<string, RowState> = {};
  for (const r of rows) {
    out[r.id] = {
      disabled: r.disabled,
      quota: r.quotaOverride == null ? "" : String(r.quotaOverride),
      saving: false,
      deleting: false,
      error: null,
    };
  }
  return out;
}

export function AdminUsers({ initial }: { initial: AdminUserRow[] }) {
  const [rows, setRows] = useState<AdminUserRow[]>(initial);
  const [state, setState] = useState<Record<string, RowState>>(() => initState(initial));

  function patch(id: string, partial: Partial<RowState>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...partial } }));
  }

  async function save(id: string) {
    const st = state[id];
    const trimmed = st.quota.trim();
    const quotaOverride = trimmed === "" ? null : Number(trimmed);
    if (quotaOverride !== null && (!Number.isFinite(quotaOverride) || quotaOverride < 0)) {
      patch(id, { error: "Quota must be a non-negative number." });
      return;
    }
    patch(id, { saving: true, error: null });
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: st.disabled, quotaOverride }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }
      // Reflect saved values back into the canonical row data.
      setRows((rs) =>
        rs.map((r) =>
          r.id === id ? { ...r, disabled: st.disabled, quotaOverride } : r,
        ),
      );
    } catch (e) {
      patch(id, { error: (e as Error).message });
    } finally {
      patch(id, { saving: false });
    }
  }

  async function deleteContent(id: string, email: string | null) {
    if (
      !window.confirm(
        `Delete ALL content (songs, projects, jobs, sources) for ${email ?? id}? The account itself is kept. This cannot be undone.`,
      )
    ) {
      return;
    }
    patch(id, { deleting: true, error: null });
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Delete failed");
      }
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...r, songsTotal: 0, songsToday: 0 } : r)),
      );
    } catch (e) {
      patch(id, { error: (e as Error).message });
    } finally {
      patch(id, { deleting: false });
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No users yet.</p>;
  }

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              User
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Songs (today / total)
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Quota override
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const st = state[r.id];
            const busy = st.saving || st.deleting;
            return (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{r.email ?? "—"}</div>
                  {r.name && <div className="text-xs text-slate-500">{r.name}</div>}
                  {st.error && (
                    <div role="alert" className="mt-1 text-xs text-red-600">
                      {st.error}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-700">
                  {r.songsToday} / {r.songsTotal}
                </td>
                <td className="px-4 py-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={st.disabled}
                      disabled={busy}
                      onChange={(e) => patch(r.id, { disabled: e.target.checked })}
                    />
                    <span className={st.disabled ? "text-red-600" : "text-slate-600"}>
                      {st.disabled ? "Disabled" : "Active"}
                    </span>
                  </label>
                </td>
                <td className="px-4 py-3">
                  <label className="sr-only" htmlFor={`quota-${r.id}`}>
                    Quota override for {r.email ?? r.id}
                  </label>
                  <input
                    id={`quota-${r.id}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="input w-28"
                    placeholder="Default"
                    value={st.quota}
                    disabled={busy}
                    onChange={(e) => patch(r.id, { quota: e.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => save(r.id)}
                    >
                      {st.saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-red-600 hover:bg-red-50"
                      disabled={busy}
                      onClick={() => deleteContent(r.id, r.email)}
                    >
                      {st.deleting ? "Deleting…" : "Delete content"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
