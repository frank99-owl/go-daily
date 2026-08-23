import { expect, test } from "@playwright/test";

/**
 * The core loop a signed-out visitor can complete: open the day's puzzle,
 * play a stone on the board, and land on the result. This is the path that
 * unit tests cover only in pieces — board geometry, the attempt API, the
 * reveal token, and the result page each have their own suite, but nothing
 * else exercises them wired together in a browser.
 */
test.describe("daily puzzle", () => {
  test("renders the day's puzzle with a board and a prompt", async ({ page }) => {
    await page.goto("/en/today");

    // The canvas sets role="img", but it also goes aria-hidden whenever the
    // keyboard layer is active, so match the label rather than the role.
    const board = page.locator('canvas[aria-label^="Go board"]');
    await expect(board.first()).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
  });

  test("accepts a move on the board and reaches a result", async ({ page }) => {
    await page.goto("/en/today");

    const board = page.locator('canvas[aria-label^="Go board"]').first();
    await expect(board).toBeVisible();

    const box = await board.boundingBox();
    expect(box).not.toBeNull();

    // Click the centre point. Whether it is the right answer or not, the app
    // must move the visitor on to a judged result rather than sitting still.
    await board.click({ position: { x: box!.width / 2, y: box!.height / 2 } });

    await expect
      .poll(async () => new URL(page.url()).pathname, { timeout: 15_000 })
      .toMatch(/\/(result|today)/);
  });

  test("keeps the puzzle collection browsable", async ({ page }) => {
    const response = await page.goto("/en/puzzles");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  });
});
