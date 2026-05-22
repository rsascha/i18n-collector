import DeleteKeyButton from "./DeleteKeyButton";
import EditableValueCell from "./EditableValueCell";
import TranslateButton from "./TranslateButton";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

type TranslationSource = "MANUAL" | "AI" | "PENDING";

type TranslationDto = {
  id: number;
  messageKey: string;
  locale: string;
  value: string;
  source: TranslationSource;
  createdAt: string;
  updatedAt: string;
};

async function fetchTranslations(): Promise<TranslationDto[]> {
  // Server-Component fetcht direkt gegen die API (cluster-intern in K8s,
  // localhost:8080 in `make dev`). Kein Umweg über den eigenen Proxy —
  // `admin.dev.localtest.me` wäre vom Pod aus nicht erreichbar.
  const res = await fetch(`${API_BASE_URL}/i18n/translations`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to load translations: ${res.status}`);
  }
  return res.json();
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const sourceBadge: Record<TranslationSource, string> = {
  MANUAL: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
  AI: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
};

export default async function TranslationsPage() {
  const rows = await fetchTranslations();
  rows.sort((a, b) =>
    a.messageKey === b.messageKey
      ? a.locale.localeCompare(b.locale)
      : a.messageKey.localeCompare(b.messageKey),
  );

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="mb-6 text-2xl font-semibold">Translations</h1>

        {rows.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No translations yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">Locale</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900"
                  >
                    <td className="px-4 py-3 text-zinc-500">{row.id}</td>
                    <td className="px-4 py-3 font-mono">{row.messageKey}</td>
                    <td className="px-4 py-3 font-mono">{row.locale}</td>
                    <td className="px-4 py-3">
                      <EditableValueCell
                        id={row.id}
                        initialValue={row.value}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${sourceBadge[row.source]}`}
                      >
                        {row.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {formatTimestamp(row.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-start justify-end gap-2">
                        <TranslateButton
                          id={row.id}
                          disabled={row.source !== "PENDING"}
                        />
                        <DeleteKeyButton id={row.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}