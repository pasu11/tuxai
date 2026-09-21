import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");

const entries = [
  "manifest.json",
  "background.js",
  "lib",
  "content",
  "sidebar",
  "icons",
  "README.md",
  "PRIVACY.md",
  "LICENSE",
];

async function cleanAndMakeDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

async function copyEntries(dest) {
  for (const entry of entries) {
    const source = path.join(root, entry);
    const target = path.join(dest, entry);
    await cp(source, target, { recursive: true });
  }
}

function stripModuleSyntaxForBackground(source) {
  return source
    .replace(/\bexport\s+async\s+function\b/g, "async function")
    .replace(/\bexport\s+function\b/g, "function")
    .replace(/\bexport\s+const\b/g, "const")
    .replace(
      /const api = typeof browser !== "undefined" \? browser : chrome;\n/,
      ""
    );
}

function stripToolsImport(source) {
  return source.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*["']\.\/lib\/tools\.js["'];\n?/,
    ""
  );
}

async function buildChrome() {
  const dest = path.join(distDir, "chrome");
  await cleanAndMakeDir(dest);
  await copyEntries(dest);
  console.log(`Built ${path.relative(root, dest)}`);
}

async function buildFirefox() {
  const dest = path.join(distDir, "firefox");
  await cleanAndMakeDir(dest);
  await copyEntries(dest);

  const toolsSource = await readFile(path.join(root, "lib", "tools.js"), "utf8");
  const backgroundSource = await readFile(path.join(root, "background.js"), "utf8");
  const firefoxManifest = await readFile(
    path.join(root, "manifest.firefox.json"),
    "utf8"
  );

  const bundledBackground = `${stripModuleSyntaxForBackground(toolsSource)}\n${stripToolsImport(backgroundSource)}\n`;

  if (/import\s+.*from/.test(bundledBackground)) {
    throw new Error("Firefox background bundle still contains an import statement.");
  }

  await writeFile(path.join(dest, "background.js"), bundledBackground, "utf8");
  await writeFile(path.join(dest, "manifest.json"), firefoxManifest, "utf8");
  await rm(path.join(dest, "manifest.firefox.json"), { force: true });
  console.log(`Built ${path.relative(root, dest)}`);
}

if (process.argv.includes("--chrome")) {
  await buildChrome();
} else if (process.argv.includes("--firefox")) {
  await buildFirefox();
} else {
  await buildChrome();
  await buildFirefox();
}
