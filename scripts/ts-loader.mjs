import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

// Import the same TypeScript fixture module used by the app and Vitest.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try { return nextResolve(`${specifier}.ts`, context); } catch { /* Let Node report the original error. */ }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".ts")) return {
      format: "module",
      shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8")),
    };
    return nextLoad(url, context);
  },
});
