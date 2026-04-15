#!/usr/bin/env node

import { createWriteStream, existsSync } from "fs";
import { readdir, stat, readFile, writeFile } from "fs/promises";
import { join, relative } from "path";
import { createGzip } from "zlib";
import archiver from "archiver";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const outputPath = join(rootDir, "url-porter.zip");

/** Syncs manifest.json version from package.json in both dist/ and src/. */
async function syncManifestVersion() {
  const pkgPath = join(rootDir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));

  for (const dir of [distDir, join(rootDir, "src")]) {
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    manifest.version = pkg.version;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
  console.log(`✓ Set manifest.json version to ${pkg.version}`);
}

async function createZip() {
  if (!existsSync(distDir)) {
    console.error("Error: dist directory not found. Run 'npm run build' first.");
    process.exit(1);
  }

  await syncManifestVersion();
  console.log("Creating zip file...");

  const output = createWriteStream(outputPath);
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Maximum compression
  });

  return new Promise((resolve, reject) => {
    output.on("close", () => {
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✓ Created url-porter.zip (${sizeInMB} MB)`);
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        console.warn("Warning:", err);
      } else {
        reject(err);
      }
    });

    archive.pipe(output);

    // Add all files from dist directory
    archive.directory(distDir, false);

    archive.finalize();
  });
}

createZip()
  .then(() => {
    console.log("✓ Bundle complete!");
  })
  .catch((err) => {
    console.error("Error creating zip:", err);
    process.exit(1);
  });
