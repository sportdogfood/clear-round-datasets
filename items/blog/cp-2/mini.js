import fs from "node:fs/promises";
import path from "node:path";

export async function loadMiniText() {
  const p = path.resolve(process.cwd(), "instructions-mini.txt");
  return await fs.readFile(p, "utf8");
}
