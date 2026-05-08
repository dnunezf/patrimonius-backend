import { spawnSync } from "node:child_process";
import path from "node:path";

const cacheDir =
    process.env.PUPPETEER_CACHE_DIR ||
    path.resolve(process.cwd(), ".cache", "puppeteer");

const env = {
    ...process.env,
    PUPPETEER_CACHE_DIR: cacheDir,
};

console.log(`[puppeteer] Installing Chrome in cache: ${cacheDir}`);

const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["puppeteer", "browsers", "install", "chrome"],
    {
        stdio: "inherit",
        env,
    }
);

if (result.status !== 0) {
    process.exit(result.status ?? 1);
}