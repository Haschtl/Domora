import sharp from "sharp";

const DEFAULT_INPUT = "screenshots/google-play/phone/01-home-summary.png";
const DEFAULT_OUTPUT = "screenshots/google-play/feature-graphic.jpg";
const WIDTH = 1024;
const HEIGHT = 500;

const inputPath = process.argv[2] ?? process.env.PLAYSTORE_FEATURE_INPUT ?? DEFAULT_INPUT;
const outputPath = process.argv[3] ?? process.env.PLAYSTORE_FEATURE_OUTPUT ?? DEFAULT_OUTPUT;

await sharp(inputPath)
  .resize(WIDTH, HEIGHT, {
    fit: "cover",
    position: "center"
  })
  // Ensure no alpha channel in output.
  .flatten({ background: "#111827" })
  .jpeg({ quality: 92, mozjpeg: true })
  .toFile(outputPath);

const metadata = await sharp(outputPath).metadata();
const width = metadata.width ?? 0;
const height = metadata.height ?? 0;
if (width !== WIDTH || height !== HEIGHT) {
  throw new Error(`Unexpected output dimensions ${width}x${height}. Expected ${WIDTH}x${HEIGHT}.`);
}

console.log(`Generated Play Store feature graphic: ${outputPath} (${width}x${height})`);
