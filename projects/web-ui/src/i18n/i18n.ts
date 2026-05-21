"use client";

import i18n from "i18next";
import HttpApi from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

const API_BASE = "http://localhost:8080/i18n";

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
        loadPath: `${API_BASE}/{{lng}}/{{ns}}`,
        addPath: `${API_BASE}/{{lng}}/{{ns}}`,
      },
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

export default i18n;