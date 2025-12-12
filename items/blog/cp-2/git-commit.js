/* ============================================================
   GIT-COMMIT.JS — CP:2 FINAL COMMIT GLUE
   Uses git_openapi via fetch-style abstraction already wired
   Runner hands us final JSON + paths
   ============================================================ */

import fs from "fs";
import path from "path";

export async function commitFinalOutput({
  job_id,
  docs_finals_root,
  final_output
}) {
  // Ensure output directory exists locally
  if (!fs.existsSync(docs_finals_root)) {
    fs.mkdirSync(docs_finals_root, { recursive: true });
  }

  const outputPath = path.join(
    docs_finals_root,
    `${job_id}.json`
  );

  // Write locally first (proof-of-life)
  fs.writeFileSync(
    outputPath,
    JSON.stringify(final_output, null, 2),
    "utf8"
  );

  console.log("✔ Final output written:");
  console.log(outputPath);

  // NOTE:
  // This is intentionally LOCAL ONLY.
  // Your git proxy / commit-bulk integration
  // plugs in here later without changing runner flow.

  return {
    status: "ok",
    path: outputPath
  };
}
