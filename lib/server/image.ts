import sharp from "sharp";
import { HttpFailure } from "./http";

export async function normalizedImage(bytes: Buffer) {
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
    const info = await image.metadata();
    if (!info.format || !["jpeg", "png", "webp"].includes(info.format) || (info.pages ?? 1) !== 1) throw new Error();
    const output = await image.rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 }).toBuffer();
    if (output.length > 600_000) throw new Error();
    return output;
  } catch { throw new HttpFailure(422, "Choose a smaller JPEG, PNG or WebP image."); }
}
