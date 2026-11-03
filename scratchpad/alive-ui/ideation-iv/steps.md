**Yes, an LLM can write much of Adapt. I’d keep you responsible for the architecture, accepted behavior, and reviewing each completed feature.** The biggest risk is plausible code that quietly changes your model or adds machinery you never needed.

**Work by small feature, not by file.** A feature may touch storage, server, and client together. Artificially restricting it to one file can leave interfaces untested. Incremental features and explicit end-to-end verification also match findings from Anthropic’s work on coding agents. [anthropic.com](https://www.anthropic.com/research/effective-harnesses-for-long-running-agents?utm_source=chatgpt.com)

For Adapt, I’d use this order:

| Step                        | Implement                                                                      | Evidence it works                                                 |
| --------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **1. Minimal contracts**    | Thing, type definition, action descriptor; decide update/move/remove semantics | A small usage example type-checks                                 |
| **2. Persistent things**    | SQLite; create spaces; add/get/list/update/move/remove things                  | Restart the process and retrieve the same contents                |
| **3. Server + client**      | Authentication boundary, space access checks, requests, local cache            | Two users; neither can access the other’s space                   |
| **4. Minimal canvas**       | Display things, focus one, return to the collection                            | Focus stays local; identities survive presentation changes        |
| **5. Action execution**     | Register/invoke actions, operation status, propagate results                   | A deterministic action creates a thing that appears in the client |
| **6. Assets**               | Filesystem uploads/downloads, asset references, image presentation             | Upload, restart, reopen; another user cannot retrieve the asset   |
| **7. Real background work** | One image tool or FFmpeg operation; then LLM suggestions                       | The workspace remains usable while work runs and reports failures |
| **8. Deployment**           | Compose, persistent volume, recovery and backup procedure                      | Recreate containers and recover the workspace and media           |

Each row can take several small tasks. **Don’t ask it to implement the entire row if the resulting diff would be too large for you to understand.**

In particular, build the basic canvas early enough to test your idea. Otherwise you could spend days perfecting storage for an interaction model you haven’t experienced.

Before coding, keep **one short architecture note** in the repository containing the decisions we’ve already made:

- Things exist independently of presentation.
- Sessions own local attention.
- Storage and assets are separate adapters.
- Authentication is supplied by the application.
- Server boundaries enforce access.
- Heavy work happens outside database transactions.
- Two packages, with focused entry points.
- No speculative plugin system, distributed synchronization, or generic workflow engine.

Record the **current decision**, rather than making the LLM reconstruct it from this whole conversation.

For each task, give it:

1. **One observable outcome:** “Moving a thing persists across restart.”
2. **The relevant constraints:** “Cannot move into a descendant or another space.”
3. **A stopping point:** “Implement and verify this; leave unrelated APIs unchanged.”

Then review the diff and run the behavior yourself. Ask:

- Did it change the agreed API or semantics?
- Is each abstraction solving something needed now?
- Do the tests check the intended behavior, including a meaningful failure?
- Can I explain how this works without asking the model again?

You don’t need to interrogate every getter. **Spend your closest review on access control, transactions, concurrent updates, asset handling, and background-job failure.** Also distinguish cancellation from undo: marking an operation cancelled doesn’t automatically reverse files or records it already created.

Keep a working commit after each accepted feature. If the model starts adding complexity, shrink the task and simplify the diff before proceeding.

**Let it write most of the implementation. Don’t let the amount of code it produces become the measure of progress. For Adapt, progress is one more complete interaction that behaves exactly as you intended.**
