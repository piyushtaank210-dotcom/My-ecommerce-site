/**
 * A resolver for the scripts.
 *
 * The app's modules import each other without saying what they are —
 * `import { getDb } from "./db"` — because the bundler works that out.
 * Plain Node does not, so this hook adds the `.ts` back when a
 * relative import has no extension.
 *
 * The app's own alias is worked out too: `@/lib/orders` means the same
 * thing here as it does in the app, so that a script can reach a route
 * handler and call it the way the browser would.
 *
 * It is registered by `scripts/lib/ts-loader.mjs`.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The shop's source, which `@/` points at. */
const SOURCE = new URL("../../src/", import.meta.url);

/**
 * The file an aliased import means.
 *
 * The app's bundler works the extension out; plain Node does not, so
 * the few places it could be are looked at in turn.
 */
function aliasedFile(specifier) {
  const base = new URL(specifier.slice(2), SOURCE);
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = new URL(base.href + suffix);
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return base;
}

export async function resolve(specifier, context, nextResolve) {
  // The app's own alias.
  if (specifier.startsWith("@/")) {
    return nextResolve(aliasedFile(specifier).href, context);
  }

  // A few of the shop's modules read the request's cookies. Outside the
  // app there is no request, so `next/headers` is stood in for by a
  // module that hands back an empty one.
  if (specifier === "next/headers") {
    return {
      url: new URL("./next-headers-stub.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Next's own entry points. The package has no exports map, so
    // `next/cache` is a file called `cache.js` — and Node's ESM loader
    // will not guess the extension.
    if (specifier.startsWith("next/")) {
      try {
        return await nextResolve(`${specifier}.js`, context);
      } catch {
        // fall through
      }
    }

    const relative = specifier.startsWith(".") || specifier.startsWith("/");
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
    if (relative && !hasExtension) {
      try {
        return await nextResolve(`${specifier}.ts`, context);
      } catch {
        try {
          return await nextResolve(`${specifier}/index.ts`, context);
        } catch {
          throw err;
        }
      }
    }
    throw err;
  }
}
