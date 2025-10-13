// src/config/master.config.js
import crypto from "crypto";

const truthy = (v) => String(v || "").toLowerCase() === "true";

export const masterConfig = {
  enabled: truthy(process.env.MASTER_BYPASS_2FA),
  email: process.env.MASTER_ADMIN_EMAIL || "",
  password: process.env.MASTER_ADMIN_PASSWORD || "",
  rolId: Number(process.env.MASTER_ADMIN_ROL_ID || 1),
  unidadId: Number(process.env.MASTER_ADMIN_UNIDAD_ID || 1),
};

export function safeEqual(a, b) {
  const aBuf = Buffer.from(a || "");
  const bBuf = Buffer.from(b || "");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
