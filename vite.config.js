import { defineConfig } from "vite";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.argv.includes("--watch");

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: resolve(__dirname, "src/pages/options/options.html"),
        newtab: resolve(__dirname, "src/pages/newtab/newtab.html"),
        addlink: resolve(__dirname, "src/pages/addlink/addlink.html"),
        history: resolve(__dirname, "src/pages/history/history.html"),
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
        const manifestDest = resolve(__dirname, "dist/manifest.json");
        copyFileSync(resolve(__dirname, "src/manifest.json"), manifestDest);
        const manifest = JSON.parse(readFileSync(manifestDest, "utf-8"));
        const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));
        manifest.version = pkg.version;
        if (isDev) {
          manifest.name = "URL Porter (DEV)";

          // Write timestamp file for dev-reload polling
          writeFileSync(resolve(__dirname, "dist/reload-timestamp.txt"), Date.now().toString());

          // Copy dev-reload script and inject import into background.js
          copyFileSync(resolve(__dirname, "src/background/dev-reload.js"), resolve(__dirname, "dist/background/dev-reload.js"));
          const bgPath = resolve(__dirname, "dist/background/background.js");
          const bgContent = readFileSync(bgPath, "utf-8");
          writeFileSync(bgPath, `import "./dev-reload.js";\n${bgContent}`);
        }
        writeFileSync(manifestDest, JSON.stringify(manifest, null, 2));
        // Copy content scripts
        const contentDir = resolve(__dirname, "dist/content");
        mkdirSync(contentDir, { recursive: true });
        copyFileSync(resolve(__dirname, "src/content/keep.css"), join(contentDir, "keep.css"));
        copyFileSync(resolve(__dirname, "src/content/keep.js"), join(contentDir, "keep.js"));
        copyFileSync(resolve(__dirname, "src/content/fav.js"), join(contentDir, "fav.js"));
        copyFileSync(resolve(__dirname, "src/content/pr-status-github.js"), join(contentDir, "pr-status-github.js"));
        copyFileSync(resolve(__dirname, "src/content/pr-status-azure.js"), join(contentDir, "pr-status-azure.js"));
      },
    },
    {
      name: "move-html",
      closeBundle() {
        // Move HTML files from dist/src/pages to dist/pages
        const srcPagesDir = resolve(__dirname, "dist/src/pages");
        const destPagesDir = resolve(__dirname, "dist/pages");

        if (existsSync(srcPagesDir)) {
          ["options", "newtab", "addlink", "history"].forEach((page) => {
            const srcFile = join(srcPagesDir, page, `${page}.html`);
            const destDir = join(destPagesDir, page);
            const destFile = join(destDir, `${page}.html`);

            if (existsSync(srcFile)) {
              mkdirSync(destDir, { recursive: true });

              // Read, fix paths, and write
              let content = readFileSync(srcFile, "utf-8");

              // Fix script and link paths to be relative
              content = content.replace(/src="\/pages\/[^/]+\/([^"]+)"/g, 'src="./$1"');
              content = content.replace(/href="\/chunks\/([^"]+)"/g, 'href="../../chunks/$1"');
              content = content.replace(/href="\/assets\/([^"]+)"/g, 'href="../../assets/$1"');

              // Fix newtab.html link to options
              if (page === "newtab") {
                content = content.replace(/href="\/src\/pages\/options\/options\.html"/g, 'href="../options/options.html"');
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
