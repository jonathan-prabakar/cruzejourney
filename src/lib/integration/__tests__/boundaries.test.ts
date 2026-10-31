import { it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
it("keeps server modules, credentials and the Google SDK out of the cockpit import graph", () => {
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    expect(file).not.toMatch(/\.server\.ts$/);
    expect(source).not.toMatch(/process\.env\.GEMINI_API_KEY/);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
        continue;
      if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)
        continue;
      if (ts.isExportDeclaration(node) && node.isTypeOnly) continue;
      const spec = node.moduleSpecifier;
      if (!spec || !ts.isStringLiteral(spec)) continue;
      expect(spec.text).not.toBe("@google/genai");
      if (!spec.text.startsWith(".") && !spec.text.startsWith("@/")) continue;
      const base = spec.text.startsWith("@/")
        ? resolve("src", spec.text.slice(2))
        : resolve(dirname(file), spec.text);
      const target = [".ts", ".tsx", "/index.ts"]
        .map((s) => base + s)
        .find(existsSync);
      if (target) visit(target);
    }
  }
  visit(resolve("src/components/dashboard.tsx"));
  expect(visited.size).toBeGreaterThan(10);
});
