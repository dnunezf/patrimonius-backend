// src/utils/hash.js
import crypto from "crypto";

/** Returns a hex SHA-256 hash for a string. */
export function sha256Hex(input) {
  if (input == null) return null;
  return crypto
    .createHash("sha256")
    .update(String(input), "utf8")
    .digest("hex");
}
