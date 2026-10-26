/** The playground: Vite serves the app (HMR, Tailwind for the editor's own CSS); `editorDevServer` adds the site endpoints. */
import { defaultClientConditions, defaultServerConditions, defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { editorDevServer } from "@pagehub/dev-server";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig(({ mode }) => {
  // .env.local / .env at the repo root, then the process env (loadEnv with "" takes every key, not only VITE_*):
  // SITES_ROOT = the folder of sites to switch between, SITE_DIR = the one folder to open.
  const env = loadEnv(mode, repo, "");
  return {
    root: here,
    envDir: repo,
    plugins: [
      react(),
      tailwindcss(),
      // devKnobs: the playground is the one place the ?slow= / ?fail= network knobs are honoured
      editorDevServer({ dir: env.SITE_DIR, sitesRoot: env.SITES_ROOT || here + "sites", fontCacheDir: repo + "node_modules/.cache/site-fonts", env, devKnobs: true }),
    ],
    // the workspace packages resolve to their sources (the `source` export condition); react / react-dom are single instances
    resolve: { conditions: ["pagehub-source", ...defaultClientConditions], dedupe: ["react", "react-dom"] },
    ssr: { resolve: { conditions: ["pagehub-source", ...defaultServerConditions] } },
    server: { host: "127.0.0.1", port: 5050, strictPort: true, fs: { allow: [repo] } },
    build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  };
});
