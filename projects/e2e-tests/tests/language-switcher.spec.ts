import { test, expect } from "@playwright/test";

test.describe("Sprachumschalter", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Hello World")).toBeVisible();
  });

  test("initial: EN ist aktiv, greeting auf Englisch", async ({ page }) => {
    const enBtn = page.getByRole("button", { name: "EN", exact: true });
    const deBtn = page.getByRole("button", { name: "DE", exact: true });

    await expect(enBtn).toHaveAttribute("aria-pressed", "true");
    await expect(deBtn).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Hello World")).toBeVisible();
  });

  test("Klick DE: aktiviert DE, zeigt deutschen Text", async ({ page }) => {
    const enBtn = page.getByRole("button", { name: "EN", exact: true });
    const deBtn = page.getByRole("button", { name: "DE", exact: true });

    await deBtn.click();

    await expect(deBtn).toHaveAttribute("aria-pressed", "true");
    await expect(enBtn).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Hallo Welt")).toBeVisible();
    await expect(page.getByText("Hello World")).toHaveCount(0);
  });

  test("Klick DE → EN: schaltet zurück auf Englisch", async ({ page }) => {
    const enBtn = page.getByRole("button", { name: "EN", exact: true });
    const deBtn = page.getByRole("button", { name: "DE", exact: true });

    await deBtn.click();
    await expect(page.getByText("Hallo Welt")).toBeVisible();

    await enBtn.click();

    await expect(enBtn).toHaveAttribute("aria-pressed", "true");
    await expect(deBtn).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Hello World")).toBeVisible();
    await expect(page.getByText("Hallo Welt")).toHaveCount(0);
  });
});