import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Sharp is a devDependency used only for icon generation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp");

const sizes = [192, 512];
const svgPath = resolve(__dirname, "../public/icon.svg");
const outDir = resolve(__dirname, "../public");

async function generate() {
  const svg = readFileSync(svgPath);
  for (const size of sizes) {
    const buf = await sharp(svg).resize(size, size).png().toBuffer();
    writeFileSync(resolve(outDir, `icon-${size}.png`), buf);
    console.log(`✓ icon-${size}.png`);
  }
}

generate().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
