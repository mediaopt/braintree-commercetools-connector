import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), cssInjectedByJsPlugin()],
  build: {
    outDir: resolve(__dirname, "public"),
    lib: {
      define: {
        "process.env.NODE_ENV": JSON.stringify(mode),
      },//recommended by commercetools based on demo project experience
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, "src/main.ts"),
      name: "Connector",
      formats: ["es", "umd"],
      // the proper extensions will be added
      fileName: (format) => `connector-enabler.${format}.js`,
    },
  },
}));
