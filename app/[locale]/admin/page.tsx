"use client";

import { useCallback, useContext, useEffect, useState } from "react";

import { AdminContext } from "@/components/AdminProvider";
import { useCurrentUser } from "@/lib/auth/auth";

type Grant = {
  email: string;
  expires_at: string;
  granted_by: string;
  created_at: string;
};

export default function AdminPage() {
  const { loading } = useCurrentUser();
  const isAdmin = useContext(AdminContext);
  const [pin, setPin] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [grants, setGrants] = useState<Grant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newDays, setNewDays] = useState(30);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");

  const loadGrants = useCallback(async () => {
    setGrantsLoading(true);
    try {
      const res = await fetch("/api/admin/grants");
      const data = (await res.json()) as { grants?: Grant[] };
      if (data.grants) setGrants(data.grants);
    } finally {
      setGrantsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (verified) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load grants after PIN verification
      void loadGrants();
    }
  }, [verified, loadGrants]);

  async function handleVerify() {
    setVerifying(true);
    setVerifyError("");
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        setVerified(true);
      } else {
        setVerifyError("Wrong PIN");
      }
    } catch {
      setVerifyError("Network error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleGrant() {
    setSubmitting(true);
    setSubmitMsg("");
    try {
      const res = await fetch("/api/admin/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: newEmail, days: newDays, granted_by: newNote || "admin" }),
      });
      if (res.ok) {
        setSubmitMsg(`Granted ${newDays} days to ${newEmail}`);
        setNewEmail("");
        setNewDays(30);
        setNewNote("");
        void loadGrants();
      } else {
        const data = (await res.json()) as { error?: string };
        setSubmitMsg(`Error: ${data.error ?? "unknown"}`);
      }
    } catch {
      setSubmitMsg("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(email: string) {
    if (!confirm(`Revoke Pro access for ${email}?`)) return;
    await fetch("/api/admin/grants", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    void loadGrants();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/50">Loading…</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/50">
        Not authorized.
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-xs space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-lg font-medium text-white">Admin Access</h1>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleVerify();
            }}
            placeholder="6-digit PIN"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-center text-lg text-white tracking-[0.5em] placeholder:text-white/30 focus:outline-none focus:border-[color:var(--color-accent)]"
          />
          {verifyError && <p className="text-sm text-red-400">{verifyError}</p>}
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying || pin.length !== 6}
            className="w-full rounded-lg bg-[color:var(--color-accent)] py-2 text-sm font-medium text-black disabled:opacity-40"
          >
            {verifying ? "Verifying…" : "Enter"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-xl font-medium text-white mb-8">Pro Grants Management</h1>

      {/* Grant form */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 mb-8 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Grant Pro Access</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@example.com"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[color:var(--color-accent)] sm:col-span-1"
          />
          <input
            type="number"
            min={1}
            max={3650}
            value={newDays}
            onChange={(e) => setNewDays(Number(e.target.value))}
            placeholder="Days"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-[color:var(--color-accent)]"
          />
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Note (optional)"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[color:var(--color-accent)]"
          />
        </div>
        <button
          type="button"
          onClick={handleGrant}
          disabled={submitting || !newEmail}
          className="rounded-lg bg-[color:var(--color-accent)] px-6 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {submitting ? "Granting…" : "Grant"}
        </button>
        {submitMsg && (
          <p
            className={`text-sm ${submitMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}
          >
            {submitMsg}
          </p>
        )}
      </div>

      {/* Grants list */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-sm font-medium text-white/80 mb-4">Active Grants</h2>
        {grantsLoading ? (
          <p className="text-sm text-white/50">Loading…</p>
        ) : grants.length === 0 ? (
          <p className="text-sm text-white/50">No grants yet.</p>
        ) : (
          <div className="space-y-3">
            {grants.map((g) => {
              const expired = new Date(g.expires_at) < new Date();
              return (
                <div
                  key={g.email}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    expired ? "border-white/5 opacity-50" : "border-white/10"
                  }`}
                >
                  <div>
                    <p className="text-sm text-white">{g.email}</p>
                    <p className="text-xs text-white/50">
                      {expired ? "Expired" : "Expires"}:{" "}
                      {new Date(g.expires_at).toLocaleDateString()}
                      {g.granted_by !== "admin" && ` · ${g.granted_by}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(g.email)}
                    className="rounded px-3 py-1 text-xs text-red-400 hover:bg-red-400/10"
                  >
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
