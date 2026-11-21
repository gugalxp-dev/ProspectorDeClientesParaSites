import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";

export default function setup() {
  if (!existsSync("data")) mkdirSync("data");
  for (const f of ["data/test.db", "data/test.db-wal", "data/test.db-shm"]) rmSync(f, { force: true });
  execSync("npx prisma db push", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "file:./data/test.db", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
