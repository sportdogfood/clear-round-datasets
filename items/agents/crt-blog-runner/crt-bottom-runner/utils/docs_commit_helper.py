# utils/docs_commit_helper.py

import base64
import json
from items_clearroundtravel_com__jit_plugin import docs_commit_bulk

def safe_docs_commit(file_path: str, content: dict, message: str):
    """
    Commits a JSON file to Docs, automatically enforcing the 'docs/' prefix and correct directory.
    """

    # Normalize to correct prefix
    if not file_path.startswith("docs/"):
        file_path = f"docs/{file_path}"

    # Ensure encoding is safe
    content_b64 = base64.b64encode(
        bytes(json.dumps(content, ensure_ascii=False, indent=2), "utf-8")
    ).decode("utf-8")

    # Commit call
    result = docs_commit_bulk({
        "message": message,
        "overwrite": True,
        "files": [{
            "path": file_path,
            "content_type": "application/json",
            "content_base64": content_b64
        }]
    })

    # Validate result
    if not result.get("ok"):
        raise RuntimeError(f"Docs commit failed: {result}")
    return result
