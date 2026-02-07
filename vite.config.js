import { defineConfig } from "vite";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "fs";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: resolve(__dirname, "src/pages/options/options.html"),
        newtab: resolve(__dirname, "src/pages/newtab/newtab.html"),
        background: resolve(__dirname, "src/background/background.js"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "background/background.js";
          }
          return "pages/[name]/[name].js";
        },
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith(".css")) {
            return "assets/[name].[ext]";
          }
          return "assets/[name]-[hash].[ext]";
        },
      },
    },
  },
  publicDir: "public",
  plugins: [
    react(),
    {
      name: "copy-manifest",
      closeBundle() {
        copyFileSync(
          resolve(__dirname, "src/manifest.json"),
          resolve(__dirname, "dist/manifest.json")
        );
      },
    },
    {
      name: "move-html",
      closeBundle() {
        // Move HTML files from dist/src/pages to dist/pages
        const srcPagesDir = resolve(__dirname, "dist/src/pages");
        const destPagesDir = resolve(__dirname, "dist/pages");

        if (existsSync(srcPagesDir)) {
          ["options", "newtab"].forEach((page) => {
            const srcFile = join(srcPagesDir, page, `${page}.html`);
            const destDir = join(destPagesDir, page);
            const destFile = join(destDir, `${page}.html`);

            if (existsSync(srcFile)) {
              mkdirSync(destDir, { recursive: true });

              // Read, fix paths, and write
              let content = readFileSync(srcFile, "utf-8");

              // Fix script and link paths to be relative
              content = content.replace(
                /src="\/pages\/[^/]+\/([^"]+)"/g,
                'src="./$1"'
              );
              content = content.replace(
                /href="\/chunks\/([^"]+)"/g,
                'href="../../chunks/$1"'
              );
              content = content.replace(
                /href="\/assets\/([^"]+)"/g,
                'href="../../assets/$1"'
              );

              // Fix newtab.html link to options
              if (page === "newtab") {
                content = content.replace(
                  /href="\/src\/pages\/options\/options\.html"/g,
                  'href="../options/options.html"'
                );
              }

              writeFileSync(destFile, content);
            }
          });

          // Clean up src directory
          rmSync(resolve(__dirname, "dist/src"), {
            recursive: true,
            force: true,
          });
        }
      },
    },
  ],
});
