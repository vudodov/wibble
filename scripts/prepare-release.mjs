import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm release:version <semver>");
  process.exit(1);
}

const packageDirs = readdirSync("packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join("packages", entry.name));

const root = JSON.parse(readFileSync("package.json", "utf8"));
root.version = version;
writeFileSync("package.json", `${JSON.stringify(root, null, 2)}\n`);

for (const dir of packageDirs) {
  const file = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (pkg.private) {
    continue;
  }

  pkg.version = version;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(`Prepared Wibble packages for version ${version}.`);
