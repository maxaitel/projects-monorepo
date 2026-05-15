import { test, expect } from "@playwright/test";

test("uploads Discord JSON and chats through local provider", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: "ollama mocked reply: ship the parser cleanup",
        model: "test-ollama",
        provider: "local",
      }),
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Ollama" }).click();
  await page.locator("#discord-files").setInputFiles({
    name: "messages.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        messages: [
          {
            author: { username: "max" },
            timestamp: "2026-01-01T10:00:00.000Z",
            content: "shipping this tonight, parser is finally clean",
          },
          {
            author: { username: "max" },
            timestamp: "2026-01-02T10:00:00.000Z",
            content: "can you check the upload flow?",
          },
          {
            author: { username: "sam" },
            timestamp: "2026-01-03T10:00:00.000Z",
            content: "looks good",
          },
        ],
      }),
    ),
  });

  await expect(page.getByText("Profile built from 3 messages.")).toBeVisible();
  await expect(page.getByText("max profile active")).toBeVisible();

  await page.getByPlaceholder("Ask the persona something...").fill("what should we ship next?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("ollama mocked reply: ship the parser cleanup")).toBeVisible();
});
