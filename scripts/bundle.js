#!/usr/bin/env node
/** Bundles dist/ into url-porter.zip with a synced manifest version. */

import { createWriteStream, existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import archiver from "archiver";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { setManifestVersion } from "./manifestVersion.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const outputPath = join(rootDir, "url-porter.zip");

/**
 * Syncs manifest.json version from package.json in both dist/ and src/.
 *
 * `dist/manifest.json` is a build artifact, so it is rewritten wholesale.
 * `src/manifest.json` is a tracked source file and is patched in place instead:
 * a JSON round-trip re-expands the arrays that the repo formatter keeps
 * collapsed, so rewriting it made every release produce a spurious
 * "format code" commit that only reflowed this one file.
 *
 * @returns {Promise<void>}
 */
async function syncManifestVersion() {
  const pkgPath = join(rootDir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));

  const distManifestPath = join(distDir, "manifest.json");
  const distManifest = JSON.parse(await readFile(distManifestPath, "utf-8"));
  distManifest.version = pkg.version;
  await writeFile(distManifestPath, JSON.stringify(distManifest, null, 2) + "\n");

  const srcManifestPath = join(rootDir, "src", "manifest.json");
  const srcRaw = await readFile(srcManifestPath, "utf-8");
  const srcPatched = setManifestVersion(srcRaw, pkg.version);
  if (srcPatched !== srcRaw) {
    await writeFile(srcManifestPath, srcPatched);
  }

  console.log(`✓ Set manifest.json version to ${pkg.version}`);
}

/** Zips dist/ into url-porter.zip. @returns {Promise<void>} */
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
