import { defineConfig } from "vite";
import monacoEditorPlugin from "vite-plugin-monaco-editor";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  root: ".",
  publicDir: "public",
  plugins: [
    (monacoEditorPlugin as any).default({
      languageWorkers: ["editorWorkerService", "css", "html", "json", "typescript"],
      customWorkers: [],
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/vivid/**", "vivid/**"],
    },
    fs: {
      strict: true,
      allow: [".", "node_modules"],
      deny: ["vivid", "vivid/**"],
    },
  },
  build: {
    rollupOptions: {
      external: (id) => {
        return id.includes("/vivid/") || id.includes("vivid/build");
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // Only scan these specific entry points, not the whole directory tree
    entries: ["index.html"],
    // Exclude vivid from optimization
    exclude: ["vivid"],
    // Use esbuild plugin to block vivid imports
    esbuildOptions: {
      plugins: [
        {
          name: "exclude-vivid",
          setup(build) {
            // Mark all paths containing /vivid/ as external
            build.onResolve({ filter: /vivid/ }, (args) => {
              if (args.path.includes("/vivid/") || args.importer?.includes("/vivid/")) {
                return { path: args.path, external: true };
              }
              return null;
            });
          },
        },
      ],
    },
  },
});
