import { expect, test } from "@playwright/test";

test("loads the trainer and records focused panel keyboard input", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Practice field" })).toBeVisible();
  const rotationSelect = page.getByRole("combobox", { name: "Rotation" });

  await expect(rotationSelect).toBeVisible();
  await expect(page.getByText("Reference Rotation")).toBeVisible();

  const canvas = page.getByTestId("phaser-host").locator("canvas");
  await expect(canvas).toHaveCount(1);
  await expect.poll(async () => canvas.evaluate((node) => node.clientWidth)).toBeGreaterThan(0);
  await expect.poll(async () => canvas.evaluate((node) => node.clientHeight)).toBeGreaterThan(0);

  await rotationSelect.selectOption("half-weave-22-1w");

  await expect(rotationSelect).toHaveValue("half-weave-22-1w");
  await expect(rotationSelect.locator("option:checked")).toHaveText("2:2 1w - 1:1 half-weave");
  await expect(page.getByRole("link", { name: "Diziet rotationtools" })).toHaveAttribute(
    "href",
    /diziet559\.github\.io\/rotationtools/,
  );

  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Reset Log" }).click();
  await page.keyboard.press("Digit4");

  const abilityPressRow = page
    .getByRole("listitem")
    .filter({ hasText: "ability-press" })
    .filter({ hasText: "steadyShot" });
  await expect(abilityPressRow).toBeVisible();
});
