import { expect, test } from "@playwright/test";

test("home page shows create and join paths", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Pickup Texts Ranked" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join room" })).toBeVisible();
});
