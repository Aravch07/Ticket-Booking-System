import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
const cli = join(
  homedir(),
  "AppData/Roaming/npm/node_modules/vercel/dist/vc.js",
);
for (const key of ["SESSION_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"]) {
  if (!process.env[key]) throw new Error(`${key} is missing.`);
  const r = spawnSync(
    process.execPath,
    [
      cli,
      "env",
      "add",
      key,
      "--environment",
      "production,preview",
      "--sensitive",
      "--yes",
      "--scope",
      "uni-321d",
    ],
    { input: process.env[key], encoding: "utf8" },
  );
  // Never print environment values or the child process's potentially sensitive output.
  if (r.status !== 0)
    throw new Error(
      `Could not configure ${key}. Check Vercel environment settings.`,
    );
  console.log(`${key}: configured for production and preview.`);
}
