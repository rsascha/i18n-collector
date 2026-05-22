"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type Props = {
  id: number;
  initialValue: string;
};

export default function EditableValueCell({ id, initialValue }: Props) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const busy = isSaving || isRefreshing;
  const trimmed = draft.trim();
  const dirty = trimmed !== initialValue;
  const canSave = dirty && trimmed.length > 0 && !busy;

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  function startEdit() {
    setDraft(initialValue);
    setError(null);
    setIsEditing(true);
  }

  function cancel() {
    setDraft(initialValue);
    setError(null);
    setIsEditing(false);
  }

  async function save() {
    if (!canSave) return;
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/i18n/translations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: trimmed }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `HTTP ${res.status}`);
        return;
      }
      setIsEditing(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="w-full text-left rounded px-1 -mx-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        title="Click to edit"
      >
        {initialValue}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
      </div>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}