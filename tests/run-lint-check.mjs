// Catches an entire class of bug that node --check CANNOT catch: reading a
// variable that was never declared in any accessible scope. This is a pure
// syntax check — `var role = 5; role;` and `role;` (undeclared) both parse
// as valid JavaScript, so --check passes either way. The bug only shows up
// at RUNTIME, when that line actually executes ("role is not defined"),
// which is exactly how a "role is not defined" crash reached production
// once already: a refactor removed a variable's declaration but missed one
// remaining use of it, several hundred lines later in the same function.
//
// This uses ESLint's no-undef rule instead, which does real scope analysis
// across the whole file — it will catch this whole class of mistake (typos
// in variable names, a declaration removed while a use was missed, etc.)
// BEFORE shipping, not after a user hits the broken line in production.
// Run this after any edit to index.html's <script>, every time.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const html = readFileSync(path.join(repoRoot, "index.html"), "utf8");

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) { console.error("No <script> blocks found in index.html"); process.exit(1); }
const appScript = scripts.reduce((a, b) => (b.length > a.length ? b : a), "");

const tmpFile = path.join(repoRoot, "tests", "_lint-target.js");
writeFileSync(tmpFile, appScript);

const eslintBin = path.join(repoRoot, "node_modules", ".bin", "eslint");
const configFile = path.join(__dirname, "eslintrc-undeclared-vars.json");

try {
  execFileSync(eslintBin, ["--no-eslintrc", "-c", configFile, tmpFile], { stdio: "inherit" });
  console.log("\nno-undef check: PASS — no undeclared-variable references found.");
} catch (e) {
  console.error("\nno-undef check: FAIL — see undeclared-variable references above.");
  console.error("(If a name here is actually a legitimate external library global — like");
  console.error("Leaflet's `L`, or XLSX/html2canvas — add it to the \"globals\" list in");
  console.error("tests/eslintrc-undeclared-vars.json rather than ignoring this.)");
  process.exit(1);
}
