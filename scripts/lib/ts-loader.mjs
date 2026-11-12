/**
 * Registers the TypeScript resolver for a script.
 *
 *   import { registerTsResolver } from "./lib/ts-loader.mjs";
 *   registerTsResolver();
 *   const { getDb } = await import("../src/lib/db.ts");
 *
 * It has to be registered before the app's modules are imported, and
 * the imports have to be dynamic — a static import is resolved before
 * any of this runs.
 */
import { register } from "node:module";


export function registerTsResolver() {
  register(new URL("./ts-resolve.mjs", import.meta.url).href);
}
