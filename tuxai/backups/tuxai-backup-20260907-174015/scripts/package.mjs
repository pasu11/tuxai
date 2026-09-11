import { execFileSync } from "node:child_process";
import { access, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const chromeDir = path.join(distDir, "chrome");
const firefoxDir = path.join(distDir, "firefox");

const crxKeyPath = path.join(distDir, "tuxai.pem");
const crxTmpPath = path.join(distDir, "chrome.crx");
const pemTmpPath = path.join(distDir, "chrome.pem");
const crxOutputPath = path.join(distDir, "tuxai.crx");
const xpiOutputPath = path.join(distDir, "tuxai.xpi");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findChromiumBrowser() {
  const fromEnv = process.env.CHROME_BIN || process.env.CHROMIUM_BIN;
  const candidates = [
    fromEnv,
    "vivaldi-stable",
    "vivaldi",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next browser binary.
    }
  }

  throw new Error(
    "Could not find Chrome/Chromium/Vivaldi. Set CHROME_BIN to your browser executable."
  );
}

async function packageChromeCrx() {
  if (!(await exists(chromeDir))) {
    throw new Error("dist/chrome not found. Run `npm run build` first.");
  }

  const browser = findChromiumBrowser();
  const profileDir = await mkdtemp(path.join(tmpdir(), "tuxai-pack-"));
  await rm(crxOutputPath, { force: true });
  await rm(crxTmpPath, { force: true });

  // If a previous manual pack left dist/chrome.pem, adopt it as the stable key.
  if (!(await exists(crxKeyPath)) && (await exists(pemTmpPath))) {
    await rename(pemTmpPath, crxKeyPath);
  }

  const hasKey = await exists(crxKeyPath);
  const args = [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--no-message-box",
    `--pack-extension=${chromeDir}`,
  ];
  if (hasKey) {
    args.push(`--pack-extension-key=${crxKeyPath}`);
  }

  try {
    execFileSync(browser, args, { stdio: ["ignore", "inherit", "ignore"] });
  } finally {
    await rm(profileDir, { recursive: true, force: true });
  }

  if (!(await exists(crxTmpPath))) {
    throw new Error("Browser did not produce dist/chrome.crx.");
  }

  // Chrome names the output after the extension folder, so rename it.
  if (!(await exists(crxKeyPath)) && (await exists(pemTmpPath))) {
    await rename(pemTmpPath, crxKeyPath);
  }
  await rename(crxTmpPath, crxOutputPath);
  console.log(`Packaged ${path.relative(root, crxOutputPath)}`);
}

async function packageFirefoxXpi() {
  if (!(await exists(firefoxDir))) {
    throw new Error("dist/firefox not found. Run `npm run build` first.");
  }

  await rm(xpiOutputPath, { force: true });
  execFileSync("zip", ["-qr", xpiOutputPath, "."], {
    cwd: firefoxDir,
    stdio: "inherit",
  });

  if (!(await exists(xpiOutputPath))) {
    throw new Error("Failed to create dist/tuxai.xpi.");
  }
  console.log(`Packaged ${path.relative(root, xpiOutputPath)}`);
}

async function main() {
  await packageChromeCrx();
  await packageFirefoxXpi();
  console.log("Packaging complete.");
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
