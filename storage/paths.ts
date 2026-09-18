import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

export function getDataDir() {
  return process.env.DATA_DIR
    ? path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR)
    : path.join(/* turbopackIgnore: true */ process.cwd(), "data");
}

export function getUploadsDir() {
  return process.env.UPLOADS_DIR
    ? path.resolve(/* turbopackIgnore: true */ process.env.UPLOADS_DIR)
    : path.join(getDataDir(), "uploads");
}

export function getDatabasePath() {
  return process.env.DATABASE_PATH
    ? path.resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH)
    : path.join(getDataDir(), "ade-kitchen.sqlite");
}

export function ensureDataDirectories() {
  mkdirSync(getDataDir(), { recursive: true });
  mkdirSync(getUploadsDir(), { recursive: true });
}
