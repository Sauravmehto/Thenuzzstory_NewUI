#!/usr/bin/env node
/**
 * Builds web-ready square copies of the product photos listed in
 * data/import/product-list.manifest.json.
 *
 *   node scripts/prepare-product-images.mjs            # build / refresh
 *   node scripts/prepare-product-images.mjs --check    # validate only, write nothing
 *
 * - Source photos are read, never modified.
 * - Output: public/assets/products/<product-id>/<view>.jpg (1600×1600 JPEG),
 *   matching the 1:1 image slots used by the shop cards and product page.
 * - Safe to rerun: data/import/images.lock.json records the source hash and
 *   settings for every output, so unchanged images are skipped. An existing
 *   file that this script did not create is never overwritten.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "data/import/product-list.manifest.json");
const LOCK = path.join(ROOT, "data/import/images.lock.json");
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

// Bump SETTINGS.version when the processing below changes, to force a rebuild.
const SETTINGS = { version: 1, size: 1600, quality: 82, padRatio: 0.08, trimThreshold: 28 };

const checkOnly = process.argv.includes("--check");

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");

async function listSourceImages(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listSourceImages(full, base)));
    else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase()))
      out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

/** Packshots on a plain backdrop: trim the empty margin, centre on a square of the backdrop colour. */
async function padToSquare(input) {
  const { data } = await sharp(input).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const background = { r: data[0], g: data[1], b: data[2] };
  const trimmed = await sharp(input).trim({ background, threshold: SETTINGS.trimThreshold }).toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const side = Math.round(Math.max(width, height) * (1 + 2 * SETTINGS.padRatio));
  return sharp({ create: { width: side, height: side, channels: 3, background } })
    .composite([{ input: trimmed.data, left: Math.round((side - width) / 2), top: Math.round((side - height) / 2) }])
    .png()
    .toBuffer();
}

/**
 * Wide studio shots on a gradient backdrop (padding with a flat colour shows a seam):
 * grow the short side by repeating the edge pixels, so the backdrop continues naturally.
 */
async function extendToSquare(input) {
  const { width, height } = await sharp(input).metadata();
  const side = Math.max(width, height);
  const padX = side - width;
  const padY = side - height;
  return sharp(input)
    .extend({
      left: Math.floor(padX / 2), right: Math.ceil(padX / 2),
      top: Math.floor(padY / 2), bottom: Math.ceil(padY / 2),
      extendWith: "copy",
    })
    .png()
    .toBuffer();
}

/** Lifestyle shots: crop to a square around the most interesting region (the dog / the print). */
async function attentionSquare(input) {
  const { width, height } = await sharp(input).metadata();
  const side = Math.min(width, height);
  return sharp(input).resize(side, side, { fit: "cover", position: sharp.strategy.attention }).png().toBuffer();
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const sourceRoot = path.join(ROOT, manifest.sourceRoot);
  const outputRoot = path.join(ROOT, manifest.outputRoot);
  const lock = existsSync(LOCK) ? JSON.parse(await readFile(LOCK, "utf8")) : {};

  // ---- validation -------------------------------------------------------
  const problems = [];
  const ids = new Set();
  const used = new Map();
  for (const p of manifest.products) {
    if (ids.has(p.id)) problems.push(`duplicate product id: ${p.id}`);
    ids.add(p.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)) problems.push(`invalid id (use lowercase-kebab): ${p.id}`);
    const views = new Set();
    for (const img of p.images) {
      if (views.has(img.view)) problems.push(`${p.id}: view "${img.view}" used twice`);
      views.add(img.view);
      if (!["pad", "extend", "attention"].includes(img.fit)) problems.push(`${p.id}: unknown fit "${img.fit}"`);
      if (!img.alt?.trim()) problems.push(`${p.id}: missing alt text for ${img.file}`);
      const resolved = path.resolve(sourceRoot, img.file);
      if (!resolved.startsWith(sourceRoot + path.sep)) problems.push(`${p.id}: path escapes source folder: ${img.file}`);
      else if (!existsSync(resolved)) problems.push(`${p.id}: source not found: ${img.file}`);
      if (used.has(img.file)) problems.push(`${img.file} assigned to both ${used.get(img.file)} and ${p.id}`);
      used.set(img.file, p.id);
    }
  }
  const onDisk = await listSourceImages(sourceRoot);
  const unassigned = onDisk.filter((f) => !used.has(f));

  console.log(`manifest: ${manifest.products.length} products, ${used.size} images assigned, ${onDisk.length} images on disk`);
  if (unassigned.length) console.log(`unassigned source images (not imported):\n  ${unassigned.join("\n  ")}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  if (checkOnly) {
    console.log("check passed (no files written)");
    return;
  }

  // ---- build ------------------------------------------------------------
  const report = { created: [], updated: [], unchanged: [], conflicts: [] };
  for (const p of manifest.products) {
    for (const img of p.images) {
      const src = path.join(sourceRoot, img.file);
      const out = path.join(outputRoot, p.id, `${img.view}.jpg`);
      const key = rel(out);
      const input = await readFile(src);
      const entry = { source: `${manifest.sourceRoot}/${img.file}`, sourceSha1: sha1(input), fit: img.fit, settings: SETTINGS };
      const prev = lock[key];

      if (existsSync(out) && !prev) {
        report.conflicts.push(`${key} exists but was not created by this script; left untouched`);
        continue;
      }
      if (prev && existsSync(out) && JSON.stringify(prev) === JSON.stringify(entry)) {
        report.unchanged.push(key);
        continue;
      }

      const squared =
        img.fit === "pad" ? await padToSquare(input)
        : img.fit === "extend" ? await extendToSquare(input)
        : await attentionSquare(input);
      const jpeg = await sharp(squared)
        .resize(SETTINGS.size, SETTINGS.size, { fit: "fill" })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: SETTINGS.quality, mozjpeg: true })
        .toBuffer();
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, jpeg);
      (prev ? report.updated : report.created).push(`${key} (${Math.round(jpeg.length / 1024)} KB)`);
      lock[key] = entry;
    }
  }

  const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(LOCK, JSON.stringify(sorted, null, 2) + "\n");

  for (const [k, list] of Object.entries(report)) {
    console.log(`\n${k}: ${list.length}`);
    if (k !== "unchanged") for (const line of list) console.log(`  ${line}`);
  }
  if (report.conflicts.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
