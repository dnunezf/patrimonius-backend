import path from "node:path";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer";

const cacheDir =
    process.env.PUPPETEER_CACHE_DIR ||
    path.join(process.cwd(), ".cache", "puppeteer");

process.env.PUPPETEER_CACHE_DIR = cacheDir;

function installChromeBrowser() {
    const result = spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["puppeteer", "browsers", "install", "chrome"],
        {
            stdio: "inherit",
            env: {
                ...process.env,
                PUPPETEER_CACHE_DIR: cacheDir,
            },
        }
    );
    return result.status === 0;
}

function buildLaunchOptions() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    return {
        headless: true,
        executablePath,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
        ],
    };
}

export async function launchPuppeteerBrowser() {
    try {
        return await puppeteer.launch(buildLaunchOptions());
    } catch (error) {
        const message = String(error?.message || "");
        const missingChrome =
            /Could not find Chrome/i.test(message) ||
            /could not find.*browser/i.test(message);
        if (!missingChrome) throw error;
        console.warn(
            `[puppeteer] Chrome no encontrado. Reintentando instalación en ${cacheDir}`
        );
        const installed = installChromeBrowser();
        if (!installed) throw error;
        return puppeteer.launch(buildLaunchOptions());
    }
}
