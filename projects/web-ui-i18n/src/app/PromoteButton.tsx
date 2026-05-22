"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { kind: "ok"; count: number } | { kind: "err"; message: string };

export default function PromoteButton({ approvedCount }: { approvedCount: number }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  const busy = isLoading || isRefreshing;

  async function handleClick() {
    const confirmed = window.confirm(
      `${approvedCount} approved Zeile(n) (AI + MANUAL) nach prod promoten?`,
    );
    if (!confirmed) return;

    setResult(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/i18n/promote`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        setResult({ kind: "err", message: text || `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as { promoted: number };
      setResult({ kind: "ok", count: body.promoted });
      startTransition(() => router.refresh());
    } catch (err) {
      setResult({
        kind: "err",
        message: err instanceof Error ? err.message : "Promote failed",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || approvedCount === 0}
        className="rounded border border-zinc-900 bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {busy ? "Promoting…" : `Promote pre-prod → prod (${approvedCount})`}
      </button>
      {result?.kind === "ok" && (
        <span className="text-xs text-green-700 dark:text-green-400">
          {result.count} Zeile{result.count === 1 ? "" : "n"} nach prod promoted ✓
        </span>
      )}
      {result?.kind === "err" && (
        <span className="text-xs text-red-600 dark:text-red-400">
          {result.message}
        </span>
      )}
    </div>
  );
}
