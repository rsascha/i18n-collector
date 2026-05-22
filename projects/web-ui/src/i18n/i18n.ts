"use client";

import i18n from "i18next";
import HttpApi from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

if (!i18n.isInitialized) {
  i18n
    .use(HttpApi)
    .use(initReactI18next)
    .init({
      fallbackLng: "en",
      supportedLngs: ["en", "de"],
      ns: ["common"],
      defaultNS: "common",
      saveMissing: true,
      backend: {
        loadPath: "/api/i18n/{{lng}}/{{ns}}",
        addPath: "/api/i18n/{{lng}}/{{ns}}",
      },
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

// Dev-only bridge for e2e/diagnose-i18n-events.spec.ts.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __i18n?: typeof i18n }).__i18n = i18n;
}

export default i18n;