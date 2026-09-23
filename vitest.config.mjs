import { fileURLToPath } from "node:url";
// Match Next.js path aliases in tests that exercise route handlers.
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
