import { rmSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const tagIndex = args.indexOf("--tag");
const tag = tagIndex >= 0 ? args[tagIndex + 1] : process.env.NPM_DIST_TAG ?? "latest";
const provenance = process.env.NPM_CONFIG_PROVENANCE === "true";
const outDir = resolve(".release-tarballs");
const npmEnv = {
  ...process.env,
  NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? resolve(".npm-cache")
};

if (!tag || tag.startsWith("--")) {
  console.error("Missing npm dist-tag after --tag.");
  process.exit(1);
}

function readPackage(dir) {
  const file = join(dir, "package.json");
  return {
    dir,
    file,
    pkg: JSON.parse(readFileSync(file, "utf8"))
  };
}

const workspaces = readdirSync("packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readPackage(join("packages", entry.name)))
  .filter((entry) => !entry.pkg.private);

const names = new Set(workspaces.map((entry) => entry.pkg.name));
const byName = new Map(workspaces.map((entry) => [entry.pkg.name, entry]));
const ordered = [];
const temporary = new Set();
const permanent = new Set();

function visit(name) {
  if (permanent.has(name)) {
    return;
  }

  if (temporary.has(name)) {
    throw new Error(`Circular workspace dependency involving ${name}.`);
  }

  temporary.add(name);
  const entry = byName.get(name);
  const dependencyNames = Object.keys({
    ...entry.pkg.dependencies,
    ...entry.pkg.peerDependencies
  }).filter((dependency) => names.has(dependency));

  for (const dependency of dependencyNames) {
    visit(dependency);
  }

  temporary.delete(name);
  permanent.add(name);
  ordered.push(entry);
}

for (const entry of workspaces) {
  visit(entry.pkg.name);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const entry of ordered) {
  console.log(`Packing ${entry.pkg.name}@${entry.pkg.version}`);
  const pack = spawnSync("pnpm", ["pack", "--pack-destination", outDir, "--json"], {
    cwd: entry.dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });

  if (pack.status !== 0) {
    process.exit(pack.status ?? 1);
  }

  const output = pack.stdout.trim();
  const packed = JSON.parse(output);
  const filename = Array.isArray(packed) ? packed[0]?.filename : packed.filename;
  if (!filename) {
    throw new Error(`Unable to determine packed tarball for ${entry.pkg.name}.`);
  }

  const publishArgs = ["publish", filename, "--access", "public", "--tag", tag];
  if (dryRun) {
    publishArgs.push("--dry-run");
  }
  if (provenance) {
    publishArgs.push("--provenance");
  }

  console.log(`${dryRun ? "Dry-running" : "Publishing"} ${entry.pkg.name}@${entry.pkg.version} with dist-tag ${tag}`);
  const publish = spawnSync("npm", publishArgs, { stdio: "inherit", env: npmEnv });
  if (publish.status !== 0) {
    process.exit(publish.status ?? 1);
  }
}
