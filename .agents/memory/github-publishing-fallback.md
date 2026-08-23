---
name: GitHub publishing fallback
description: Safely publish when a repository remote rejects its configured Git credential.
---

When a normal Git push rejects the configured HTTPS credential, use the Replit-managed GitHub connection rather than exposing or embedding a token. Prefer its authenticated SDK client and Git Database API when the generic proxy hits a sandbox replay error. Create commits from the tested local tree and advance the target ref with `force: false`, then fetch and compare trees before aligning local `main`. Artifact remotes may also diverge from the workspace's shared root history, so never push local `main` wholesale when it contains unrelated commits; build the targeted commit against the remote head. Before replaying a patch, inspect every touched path on that remote head: it may contain overlapping work absent from the local tree, and a clean-looking local patch can otherwise duplicate or replace newer remote architecture.

**Why:** The repository's legacy Git remote credential can be stale even while the managed GitHub integration remains authorized and has repository write permission. Shared workspaces can also have a local history that includes another artifact's commits.

**How to apply:** Reconcile local work to the target branch first. If touched paths differ or already exist remotely, use a temporary worktree at the remote head, adapt and validate there, then commit and push that descendant. Confirm the head has not changed immediately before the update, preserve commit messages and parent ordering, and verify the local and remote hashes after fetching. Never force-update the remote branch.

Environment facts learned the hard way (2026-08-21):
- The Git repo is rooted at the **workspace root**, even when you `cd app/` — `git rev-parse --show-toplevel` settles it. Remote `main` also contains `app/` and `website/` at its root, so remote paths keep the `app/` prefix.
- `git ls-tree` prints paths **relative to your cwd**, but `rev:path` (`git show`, `cat-file -e`) is always **root-relative**. Mixing the two produces false "path does not exist" conclusions. When in doubt, read blobs by SHA from `ls-tree` output.
- A plain push works via `git -c credential.helper='!f() { echo username=x-access-token; echo password=$GITHUB_PERSONAL_ACCESS_TOKEN; }; f' push origin ...` — the helper reads the secret from the env without ever printing it. Only fall back to the SDK Git Database API if that token itself is rejected.
- A container restart wipes `/tmp` but leaves stale worktree registrations — run `git worktree prune` before re-adding a worktree at the same path.