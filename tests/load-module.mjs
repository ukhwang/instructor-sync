import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

// Load real TypeScript modules with isolated caches and explicit external mocks.
export function loadModule(relativePath, mocks = {}, cache = new Map()) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const localRequire = (specifier) => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const resolved = specifier.startsWith('@/')
        ? path.resolve(root, specifier.slice(2))
        : path.resolve(path.dirname(filename), specifier);
      return loadModule(`${resolved}.ts`, mocks, cache);
    }
    return require(specifier);
  };
  new Function('require', 'module', 'exports', code)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
