const crypto = require("crypto");
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const nextDir = path.join(__dirname, "..", ".next");
const manifest = path.join(nextDir, "routes-manifest.json");

if (!fs.existsSync(manifest)) {
  console.log("⏳ routes-manifest.json missing — running next build...");
  execSync("npx next build", { stdio: "inherit", cwd: path.join(__dirname, "..") });
} else {
  // Check if AUTH_SECRET or AUTH_URL has changed since the last build
  // by comparing against a stored hash. If different, rebuild to pick up changes.
  const hashPath = path.join(nextDir, "env-hash.txt");
  const envPath = path.join(__dirname, "..", ".env.local");
  let currentHash = "";
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    const relevant = envContent
      .split("\n")
      .filter(l => l.startsWith("AUTH_SECRET=") || l.startsWith("AUTH_URL="))
      .join("\n");
    currentHash = crypto.createHash("md5").update(relevant).digest("hex");
  }
  let storedHash = "";
  if (fs.existsSync(hashPath)) {
    storedHash = fs.readFileSync(hashPath, "utf8").trim();
  }
  if (currentHash && currentHash !== storedHash) {
    console.log("⏳ Auth env vars changed — clearing cached build and rebuilding...");
    fs.rmSync(nextDir, { recursive: true, force: true });
    execSync("npx next build", { stdio: "inherit", cwd: path.join(__dirname, "..") });
    fs.writeFileSync(hashPath, currentHash);
  }
}

const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});

process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
