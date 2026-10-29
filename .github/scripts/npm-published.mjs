import { spawnSync } from "node:child_process";

const [name, version] = process.argv.slice(2);
if (!name || !version || process.argv.length !== 4) {
  console.error("Usage: node .github/scripts/npm-published.mjs <name> <version>");
  process.exit(1);
}

const result = spawnSync("npm", ["view", `${name}@${version}`, "version", "--json"], {
  encoding: "utf8",
});
let response;
try {
  response = JSON.parse(result.stdout);
} catch {
  // Only npm's E404 JSON establishes that a version is absent.
}

if (result.status === 0 && response === version) {
  console.log("true");
} else if (result.status === 1 && response?.error?.code === "E404") {
  console.log("false");
} else {
  console.error(`Cannot determine whether ${name}@${version} is published on npm.`);
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error.message);
  process.exit(1);
}
