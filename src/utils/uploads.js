import fs from "fs";
import os from "os";
import path from "path";

let cachedRoot = null;

function tryEnsureWritableDir(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

export function getUploadsRoot() {
    if (cachedRoot) return cachedRoot;

    const candidates = [];
    if (process.env.UPLOADS_ROOT) candidates.push(process.env.UPLOADS_ROOT);
    candidates.push(path.resolve(process.cwd(), "uploads"));
    candidates.push(path.join(os.tmpdir(), "patrimonius-uploads"));

    for (const c of candidates) {
        const dir = path.resolve(String(c));
        if (tryEnsureWritableDir(dir)) {
            cachedRoot = dir;
            console.log(`[uploads] Using uploads root: ${cachedRoot}`);
            return cachedRoot;
        }
    }

    cachedRoot = path.resolve(process.cwd(), "uploads");
    console.warn(
        `[uploads] No writable uploads root found. Falling back to: ${cachedRoot}`
    );
    return cachedRoot;
}

/** Construye una ruta absoluta dentro del uploads root. */
export function uploadsPath(...parts) {
    return path.resolve(getUploadsRoot(), ...parts);
}

/**
 * Convierte una ruta absoluta dentro del uploads root a una ruta relativa `uploads/<...>`
 * (para guardarla en BD y servirla por HTTP con /uploads).
 */
export function toUploadsRelativePath(absPath) {
    const root = getUploadsRoot();
    const rel = path.relative(root, absPath).replace(/\\/g, "/");
    return `uploads/${rel.replace(/^\/+/, "")}`;
}
