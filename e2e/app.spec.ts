import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inflateSync } from "node:zlib";

function capturePageErrors(page: Page): Error[] {
  const pageErrors: Error[] = [];

  page.on("pageerror", (error) => pageErrors.push(error));

  return pageErrors;
}

interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  return upDistance <= upLeftDistance ? up : upLeft;
}

function decodePng(buffer: Buffer): DecodedPng {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error("Unsupported PNG signature");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`Unsupported PNG format bitDepth=${bitDepth} colorType=${colorType}`);
      }
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const raw = new Uint8Array(height * stride);
  let readOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    readOffset += 1;
    const rowStart = y * stride;
    const previousRowStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const rawValue = inflated[readOffset];
      readOffset += 1;
      const left = x >= bytesPerPixel ? raw[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? raw[previousRowStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? raw[previousRowStart + x - bytesPerPixel] : 0;

      if (filter === 0) {
        raw[rowStart + x] = rawValue;
      } else if (filter === 1) {
        raw[rowStart + x] = (rawValue + left) & 0xff;
      } else if (filter === 2) {
        raw[rowStart + x] = (rawValue + up) & 0xff;
      } else if (filter === 3) {
        raw[rowStart + x] = (rawValue + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        raw[rowStart + x] = (rawValue + paethPredictor(left, up, upLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
    }
  }

  if (colorType === 6) {
    return { width, height, rgba: raw };
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < raw.length; source += 3, target += 4) {
    rgba[target] = raw[source];
    rgba[target + 1] = raw[source + 1];
    rgba[target + 2] = raw[source + 2];
    rgba[target + 3] = 255;
  }

  return { width, height, rgba };
}

function countWarmPixelsInCssRegion(
  png: DecodedPng,
  canvasCssSize: { width: number; height: number },
  region: { x: number; y: number; width: number; height: number },
): number {
  const scaleX = png.width / canvasCssSize.width;
  const scaleY = png.height / canvasCssSize.height;
  const startX = Math.max(0, Math.round(region.x * scaleX));
  const startY = Math.max(0, Math.round(region.y * scaleY));
  const endX = Math.min(png.width, Math.round((region.x + region.width) * scaleX));
  const endY = Math.min(png.height, Math.round((region.y + region.height) * scaleY));
  let warmPixels = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * png.width + x) * 4;
      const red = png.rgba[index];
      const green = png.rgba[index + 1];
      const blue = png.rgba[index + 2];
      const alpha = png.rgba[index + 3];

      if (alpha > 20 && red > 100 && green > 60 && blue < 150 && red + green + blue > 180) {
        warmPixels += 1;
      }
    }
  }

  return warmPixels;
}

function getWarmPixelBoundsInCssRegion(
  png: DecodedPng,
  canvasCssSize: { width: number; height: number },
  region: { x: number; y: number; width: number; height: number },
): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const scaleX = png.width / canvasCssSize.width;
  const scaleY = png.height / canvasCssSize.height;
  const startX = Math.max(0, Math.round(region.x * scaleX));
  const startY = Math.max(0, Math.round(region.y * scaleY));
  const endX = Math.min(png.width, Math.round((region.x + region.width) * scaleX));
  const endY = Math.min(png.height, Math.round((region.y + region.height) * scaleY));
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * png.width + x) * 4;
      const red = png.rgba[index];
      const green = png.rgba[index + 1];
      const blue = png.rgba[index + 2];
      const alpha = png.rgba[index + 3];

      if (alpha > 20 && red > 100 && green > 60 && blue < 150 && red + green + blue > 180) {
        left = Math.min(left, x / scaleX);
        top = Math.min(top, y / scaleY);
        right = Math.max(right, x / scaleX);
        bottom = Math.max(bottom, y / scaleY);
      }
    }
  }

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    throw new Error("Expected warm Phaser HUD pixels inside the sampled region");
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

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

test("renders the Phaser canvas at high-DPI backing size in Auto mode", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1848, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const pageErrors = capturePageErrors(page);

  await page.goto("/");
  const canvas = page.getByTestId("phaser-host").locator("canvas");
  await expect(canvas).toHaveCount(1);
  await expect(page.getByLabel("Render Scale")).toHaveValue("auto");

  const sizes = await canvas.evaluate((node) => {
    const canvasNode = node as HTMLCanvasElement;
    const rect = node.getBoundingClientRect();
    return {
      backingWidth: canvasNode.width,
      backingHeight: canvasNode.height,
      cssWidth: rect.width,
      cssHeight: rect.height,
    };
  });

  expect(sizes.cssWidth).toBeGreaterThan(0);
  expect(sizes.cssHeight).toBeGreaterThan(0);
  expect(sizes.backingWidth).toBe(Math.round(sizes.cssWidth * 2));
  expect(sizes.backingHeight).toBe(Math.round(sizes.cssHeight * 2));
  expect(pageErrors).toEqual([]);

  await context.close();
});

test("lets manual 1x render scale opt out of high-DPI backing size", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1848, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const pageErrors = capturePageErrors(page);

  await page.goto("/");
  await page.getByLabel("Render Scale").selectOption("1");
  const canvas = page.getByTestId("phaser-host").locator("canvas");

  const sizes = await canvas.evaluate((node) => {
    const canvasNode = node as HTMLCanvasElement;
    const rect = node.getBoundingClientRect();
    return {
      backingWidth: canvasNode.width,
      backingHeight: canvasNode.height,
      cssWidth: rect.width,
      cssHeight: rect.height,
    };
  });

  expect(sizes.cssWidth).toBeGreaterThan(0);
  expect(sizes.cssHeight).toBeGreaterThan(0);
  expect(sizes.backingWidth).toBe(Math.round(sizes.cssWidth));
  expect(sizes.backingHeight).toBe(Math.round(sizes.cssHeight));
  await expect(canvas).toBeVisible();
  expect(pageErrors).toEqual([]);

  await context.close();
});

test("keeps Phaser HUD aligned at high-DPI render scale", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1848, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const pageErrors = capturePageErrors(page);

  await page.goto("/");
  const canvas = page.getByTestId("phaser-host").locator("canvas");
  await expect(page.getByLabel("Render Scale")).toHaveValue("auto");
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("Expected Phaser canvas to have a bounding box");
  }

  const screenshot = await canvas.screenshot();
  const png = decodePng(screenshot);
  const expectedHudPixels = countWarmPixelsInCssRegion(
    png,
    { width: box.width, height: box.height },
    { x: box.width / 2 - 330, y: box.height / 2 + 65, width: 660, height: 250 },
  );
  const misplacedHudPixels = countWarmPixelsInCssRegion(
    png,
    { width: box.width, height: box.height },
    { x: 0, y: 120, width: 280, height: 340 },
  );

  expect(expectedHudPixels).toBeGreaterThan(2_000);
  expect(misplacedHudPixels).toBeLessThan(1_000);
  expect(pageErrors).toEqual([]);

  await context.close();
});

test("keeps Phaser HUD the same visual size across render scales", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1848, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const pageErrors = capturePageErrors(page);

  await page.goto("/");
  const canvas = page.getByTestId("phaser-host").locator("canvas");
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("Expected Phaser canvas to have a bounding box");
  }

  await page.getByLabel("Render Scale").selectOption("1");
  const oneXBounds = getWarmPixelBoundsInCssRegion(
    decodePng(await canvas.screenshot()),
    { width: box.width, height: box.height },
    { x: box.width / 2 - 360, y: box.height / 2 - 80, width: 720, height: 420 },
  );

  await page.getByLabel("Render Scale").selectOption("2");
  const twoXBounds = getWarmPixelBoundsInCssRegion(
    decodePng(await canvas.screenshot()),
    { width: box.width, height: box.height },
    { x: box.width / 2 - 360, y: box.height / 2 - 80, width: 720, height: 420 },
  );

  expect(Math.abs(twoXBounds.width - oneXBounds.width)).toBeLessThan(40);
  expect(Math.abs(twoXBounds.height - oneXBounds.height)).toBeLessThan(40);
  expect(Math.abs((twoXBounds.left + twoXBounds.right) / 2 - (oneXBounds.left + oneXBounds.right) / 2)).toBeLessThan(
    40,
  );
  expect(pageErrors).toEqual([]);

  await context.close();
});

test("fires Raptor Strike from the first Mouse 4 press on the practice canvas", async ({ page }) => {
  await page.goto("/");

  const canvas = page.getByTestId("phaser-host").locator("canvas");
  await expect(canvas).toHaveCount(1);
  await expect.poll(async () => canvas.evaluate((node) => node.clientWidth)).toBeGreaterThan(0);
  await expect.poll(async () => canvas.evaluate((node) => node.clientHeight)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Reset Log" }).click();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(100);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(2500);
  await canvas.dispatchEvent("mousedown", { button: 3, bubbles: true, cancelable: true });

  const latestRow = page.getByRole("listitem").first();
  await expect(latestRow).toContainText("cast-complete");
  await expect(latestRow).toContainText("raptorStrike");

  const raptorCastRow = page
    .getByRole("listitem")
    .filter({ hasText: "cast-start" })
    .filter({ hasText: "raptorStrike" });
  await expect(raptorCastRow).toBeVisible();
});
