// Forensik-Vorlage für i18next-Probleme: hängt sich an die window.__i18n-Bridge
// (nur dev), loggt language/resolvedLanguage/hasResourceBundle pro Event und gibt
// die Sequenz am Ende auf stdout aus. Läuft im normalen Test-Run mit; für
// fokussierte Diagnose-Sessions: `pnpm --filter e2e-tests test:diagnose`.
import { test } from "@playwright/test";

test("diagnose: i18next-Event-Sequenz beim Klick auf DE", async ({ page }) => {
  const diagLines: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.startsWith("[diag]")) diagLines.push(text);
  });

  await page.goto("/");
  await page.waitForFunction(
    () =>
      (window as unknown as { __i18n?: { isInitialized: boolean } }).__i18n
        ?.isInitialized === true,
  );

  await page.evaluate(() => {
    const i18n = (
      window as unknown as {
        __i18n: {
          language: string;
          resolvedLanguage: string;
          hasResourceBundle: (lng: string, ns: string) => boolean;
          t: (k: string, opts?: object) => string;
          on: (ev: string, cb: (...args: unknown[]) => void) => void;
        };
      }
    ).__i18n;

    const stamp = (label: string) =>
      `[diag] ${label} language=${i18n.language} resolvedLanguage=${i18n.resolvedLanguage} hasEN=${i18n.hasResourceBundle("en", "common")} hasDE=${i18n.hasResourceBundle("de", "common")} t(greeting)=${i18n.t("greeting", { defaultValue: "?" })}`;

    console.log(stamp("before-listeners"));

    i18n.on("languageChanged", (lng: unknown) => {
      console.log(stamp(`event:languageChanged(${String(lng)})`));
    });
    i18n.on("loaded", (loaded: unknown) => {
      console.log(stamp(`event:loaded(${JSON.stringify(loaded)})`));
    });
    i18n.on("failedLoading", (lng: unknown, ns: unknown, err: unknown) => {
      console.log(
        stamp(
          `event:failedLoading(${String(lng)}/${String(ns)} err=${String(err)})`,
        ),
      );
    });
    i18n.on("added", (lng: unknown, ns: unknown) => {
      console.log(stamp(`event:added(${String(lng)}/${String(ns)})`));
    });
    i18n.on("initialized", () => {
      console.log(stamp("event:initialized"));
    });
  });

  console.log("[diag] >>> clicking DE");
  await page.getByRole("button", { name: "DE", exact: true }).click();

  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const i18n = (
      window as unknown as {
        __i18n: {
          language: string;
          resolvedLanguage: string;
          hasResourceBundle: (lng: string, ns: string) => boolean;
          t: (k: string, opts?: object) => string;
        };
      }
    ).__i18n;
    console.log(
      `[diag] AFTER-2s language=${i18n.language} resolvedLanguage=${i18n.resolvedLanguage} hasEN=${i18n.hasResourceBundle("en", "common")} hasDE=${i18n.hasResourceBundle("de", "common")} t(greeting,lng=de)=${i18n.t("greeting", { defaultValue: "?", lng: "de" })} t(greeting,default)=${i18n.t("greeting", { defaultValue: "?" })}`,
    );
  });

  console.log("\n========== DIAGNOSE EVENT TRACE ==========");
  for (const line of diagLines) console.log(line);
  console.log("========== END TRACE ==========\n");
});
