"use client";

import i18n from "i18next";
import HttpApi from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

if (!i18n.isInitialized) {
  i18n
    .use(HttpApi)
    .use(initReactI18next)
    .init({
      debug: true,
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
        bindI18n: "languageChanged loaded",
        bindI18nStore: "added",
      },
    });
}

export default i18n;