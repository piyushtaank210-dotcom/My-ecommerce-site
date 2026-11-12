/**
 * A resolver for the scripts.
 *
 * The app's modules import each other without saying what they are —
 * `import { getDb } from "./db"` — because the bundler works that out.
 * Plain Node does not, so this hook adds the `.ts` back when a
 * relative import has no extension.
 *
 * It is registered by `scripts/lib/ts-loader.mjs`.
 */
export async function resolve(specifier, context, nextResolve) {
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
