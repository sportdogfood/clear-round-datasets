import fs from "node:fs/promises";
import path from "node:path";

export async function commitBulk({ message, overwrite = true, files = [] }) {
  // Local simulation: writes committed files under ./_simulated_docs/
  // Does NOT change your app logic; it just prevents module-not-found and shows outputs.
  const outRoot = path.resolve(process.cwd(), "_simulated_docs");

  await fs.mkdir(outRoot, { recursive: true });

  for (const f of files) {
    if (!f?.path || !f?.content_base64) continue;

    const abs = path.join(outRoot, f.path.replace(/^\/+/, ""));
    const dir = path.dirname(abs);
    await fs.mkdir(dir, { recursive: true });

    const buf = Buffer.from(f.content_base64, "base64");
    await fs.writeFile(abs, buf);
  }

  return {
    ok: true,
    simulated: true,
    message,
    overwrite,
    file_count: files.length,
    out_root: outRoot
  };
}
