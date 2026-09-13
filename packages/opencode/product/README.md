# Product configuration

This directory is the product's managed configuration: the config fragment, the product skills and
the product agent profiles that ship with the desktop package. It is data, not code — nothing here
is imported, it is discovered by the engine's normal configuration mechanisms.

```
opencode.json        managed config fragment: instructions, skills, permission baseline
agent/dream.md       the memory consolidation profile and its allowlist
skills/memory/       how an agent saves a memory (ENG-19, RULE-11)
skills/dream/        the four-phase consolidation pass the dream profile runs
```

## What the host must do

The daemon starts the engine as `opencode acp` and sets these environment variables:

| Variable | Value | Why |
| --- | --- | --- |
| `OPENCODE_CONFIG_DIR` | absolute path of this directory | makes it a configuration directory, so `opencode.json`, `agent/*.md` and `skills/*/SKILL.md` are all discovered. It is *added to* the XDG configuration directory, it does not replace it. |
| `HARNESS_PRODUCT_DIR` | the same path | `skills.paths` needs an absolute path; configuration values cannot be written relative to the configuration file. |
| `HARNESS_MEMORY_DIR` | absolute path of the shared memory directory | the memory index and the memory permission patterns are written against it. Optional: it defaults to `<XDG_DATA_HOME>/opencode/memory`, and the default is written back into the environment before any configuration is read, so the variable is never empty — an empty substitution would turn a `<dir>/*` rule into `/*`. |

The memory directory holds `MEMORY.md` plus one file per fact. The engine creates it if it is
missing. It never leaves the machine.

## Keys used, and what each one buys

- `instructions: ["{env:HARNESS_MEMORY_DIR}/MEMORY.md"]` — the index is injected into every agent's
  system prompt. Instructions are resolved per session, not per profile, which is what makes one
  memory shared by every profile (RULE-11).
- `skills.paths: ["{env:HARNESS_PRODUCT_DIR}/skills"]` — registers the product skills. Redundant by
  design: `OPENCODE_CONFIG_DIR` already makes `skills/*/SKILL.md` discoverable, and the explicit
  path keeps them working if the host points the configuration directory elsewhere.
- `permission.external_directory` — the memory directory sits outside the session's worktree, so
  every tool that touches it passes this gate first. Allowing it is what lets the memory skill write
  without a prompt, and it is the only rule that can name the directory by absolute path for all
  tools.
- `permission.read` / `permission.edit` — allow the file tools on memory files. These two permissions
  are asked on a path relative to the worktree by the file tools and on the canonical path by the
  location-based ones, so the patterns carry a leading `*` and only bite on the canonical form; the
  relative form is covered by `external_directory` above.
- `permission.bash` — refuses any shell command whose text names the memory directory. The shell is
  not the memory write path. The same rule is also merged after the host's permission baseline in
  `Agent`'s `sensitive` ruleset, so a blanket `{"*": "allow"}` cannot widen it (PERM-04).
- `default_agent: "default"` — the product default profile (ENG-17).
- `agent/dream.md` frontmatter — the consolidation profile's allowlist: markdown reads and writes,
  `glob`, `list`, the `dream` skill, and nothing else. `external_directory: deny` is what confines
  it, because the host opens the pass with the memory directory as the working directory (below), so
  "outside the memory directory" and "outside the worktree" are the same thing for that session.
  Note that it deliberately does not carry a blanket `read: allow`: a profile that widens `read`
  would override the sensitive-file rule merged before it.

## Running the consolidation pass

`dream` is a primary, non-hidden profile, so ACP exposes it as a session mode. The host triggers the
pass itself (T-15: when the machine is idle and enough sessions have happened since the last pass);
the engine has no timer.

1. `session/new` with `cwd` set to **the memory directory** and `_meta: { "mode": "dream" }`. The
   working directory is load-bearing: it is what makes the profile's rules mean "inside memory". An
   unknown mode name fails the call, so a typo cannot silently run the pass under another profile.
2. `session/prompt` with exactly this text:

   ```
   Run the memory consolidation pass now. Load the dream skill and follow its four phases to completion, then report what changed.
   ```

3. Read the final assistant message as the report, then close the session.

`session/new` followed by `session/setSessionMode` is the other way in and behaves the same; it costs
one more round trip.

## Residuals

These are known gaps, not oversights. Each one needs a mechanism this directory does not have.

- **"Only the memory skill may write memory" is not enforceable here.** Permission rules are scoped
  to a tool and a path, never to the skill the agent is following, so the file tools are allowed on
  the memory directory unconditionally. Closing this needs a plugin-registered memory tool, with the
  file tools denied on the directory; the skill text is the only constraint until then.
- **Shell denial is by command text.** The rule matches commands that name the memory directory. A
  command that reaches it without naming it — through a symlink, a variable, or an earlier `cd` — is
  not caught.
- **Subagents see the index.** Instructions are resolved per session and a subagent's session
  resolves them the same way, so the index reaches subagent prompts too. ENG-19 wants it kept out of
  them; until that is expressible, the `memory` skill carries the rule behaviourally (a subagent
  neither receives memory content in its prompt nor saves memories).
