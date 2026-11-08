/**
 * Checks that every call to the database is waited for.
 *
 * The shop's queries are asynchronous: PostgreSQL hands back a promise,
 * and a statement that is not waited for is a statement whose result may
 * not have arrived. Two shapes hide that:
 *
 *   · a statement handle held in a variable — `const update = db.prepare(...)`
 *     — and then called on its own
 *   · a local function written as `const check = async () => {...}`, whose
 *     caller never waits for it
 *
 * The second is the more dangerous of the two: a call like
 *
 *   while (check(candidate)) { ... }
 *
 * tests a promise, and a promise is always true — so the loop never ends.
 *
 *   node scripts/check-async.mjs
 */
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function listFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(p, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Whether the expression is already waited for. */
function isAwaited(node) {
  let n = node;
  while (n.parent && ts.isParenthesizedExpression(n.parent)) n = n.parent;
  return Boolean(n.parent && ts.isAwaitExpression(n.parent));
}

const problems = [];

for (const file of listFiles(join(ROOT, "src"))) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  // The statement handles and the local async functions.
  const handles = new Set();
  const local = new Set();

  const visit1 = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const init = node.initializer;
      if (
        ts.isCallExpression(init) &&
        ts.isPropertyAccessExpression(init.expression) &&
        init.expression.name.text === "prepare"
      ) {
        handles.add(node.name.text);
      }
      if (
        (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
        init.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
      ) {
        local.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit1);
  };
  visit1(sf);

  if (!handles.size && !local.size) continue;

  const visit2 = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      const name = node.expression.expression.text;
      const method = node.expression.name.text;

      const isStatement =
        handles.has(name) && ["all", "get", "run"].includes(method);
      const isLocal = local.has(name);

      if ((isStatement || isLocal) && !isAwaited(node)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        problems.push(
          `${file.replace(ROOT + "\\", "")}:${line + 1}  ${node.getText(sf).slice(0, 70)}`
        );
      }
    }
    ts.forEachChild(node, visit2);
  };
  visit2(sf);
}

// The SQLite handle is synchronous, so its statements are not promises.
const real = problems.filter((p) => !p.includes("src\\lib\\db.ts"));

if (real.length) {
  console.log(`${real.length} call(s) that are not waited for:`);
  for (const p of real) console.log("  " + p);
  process.exit(1);
}

console.log("✓ every call to the database is waited for");
