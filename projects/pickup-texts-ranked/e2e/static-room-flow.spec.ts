import { expect, test } from "@playwright/test";

test("home page shows create and join paths", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /pickup texts ranked/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /create room/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /enter room/i })).toBeVisible();
});
