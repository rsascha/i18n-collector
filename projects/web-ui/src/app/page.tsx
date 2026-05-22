"use client";

import { useSyncExternalStore } from "react";
import i18n, { SUPPORTED_LNGS } from "@/i18n/i18n";

function subscribe(callback: () => void) {
  i18n.on("languageChanged", callback);
  i18n.on("loaded", callback);
  i18n.on("initialized", callback);
  return () => {
    i18n.off("languageChanged", callback);
    i18n.off("loaded", callback);
    i18n.off("initialized", callback);
  };
}

const getSnapshot = () => i18n.language;
const getServerSnapshot = () => undefined;

export default function Home() {
  const active = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Triggert saveMissing für jede supportedLng, damit die API auch dann einen
  // Fan-out machen kann, wenn der Key in der aktiven Sprache bereits existiert
  // (sonst entstehen DE-PENDING-Zeilen erst beim Sprachwechsel).
  const t = (key: string, defaultValue: string) => {
    for (const lng of SUPPORTED_LNGS) {
      if (lng !== active) {
        i18n.t(key, { defaultValue, lng });
      }
    }
    return i18n.t(key, { defaultValue, lng: active });
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="mb-6 flex gap-2">
          {(["en", "de"] as const).map((lng) => (
            <button
              key={lng}
              type="button"
              aria-pressed={active === lng}
              onClick={() => i18n.changeLanguage(lng)}
              className={`rounded border px-3 py-1 text-sm ${
                active === lng
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
        <p>{t("greeting", "Hello World")}</p>
        <p>{t("unknown.key", "Unknown Key Test")}</p>
        <p>{t("anotherTest", "This is just another test!")}</p>
        <p>{t("andAnotherTest", "This is just another test!")}</p>
      </main>
    </div>
  );
}
