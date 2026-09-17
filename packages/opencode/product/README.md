# Product configuration

This directory is the product's managed configuration: the config file, the product skills and the
product agent profiles that ship with the desktop package. It is data, not code — nothing here is
imported, it is discovered by the engine's normal configuration mechanisms.

```
opencode.json        managed config: the model gateway, instructions, skills, the browser MCP server, permission baseline
agent/dream.md       the memory consolidation profile and its allowlist
skills/memory/       how an agent saves a memory (ENG-19, RULE-11)
skills/dream/        the four-phase consolidation pass the dream profile runs
```

## Zero configuration

The product has to work on a fresh install with nothing set (ENG-04, ENG-19), so the engine finds
this directory itself: `src/config/product.ts` resolves it next to the engine — the package directory
in a source checkout, the executable's own directory once compiled — adds it to the configuration
directories, and writes every variable the file below substitutes into the environment _before_ any
configuration is read. An unset variable substitutes to an empty string, which would turn
`{env:DIR}/*` into `/*` and `node {env:ENTRY}` into `node ""`, so none of them is ever left empty.

This file is the **base** every other configuration layers onto, not the last word: it is merged
before the user's global file and before any other configuration directory, so a host that names its
own gateway, permission rules or MCP servers overrides what is here. Two definitions of the same
provider merge rather than collide. The provider lock that RULE-02 needs does not depend on this
ordering: it is in source — `@ai-sdk/openai-compatible` is the only adapter that exists, and a
provider is only reachable when a configuration defines it explicitly (`src/provider/provider.ts`).

| Variable                       | Unset                                                                                                        | Set by                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `OPENCODE_CONFIG_DIR`          | this directory is added to the configuration directories, next to the XDG one                                | the host, only to use its own copy of this directory instead        |
| `HARNESS_PRODUCT_DIR`          | this directory; `OPENCODE_CONFIG_DIR` when the host named one                                                | the host, only to split the two apart                               |
| `HARNESS_MEMORY_DIR`           | `<XDG_DATA_HOME>/opencode/memory`, created on startup                                                        | the host, to put the shared memory elsewhere                        |
| `HARNESS_BROWSER_MCP_ENTRY`    | the bin of the `chrome-devtools-mcp` installed next to the engine; the server is disabled when there is none | the host, to run a different build                                  |
| `HARNESS_BROWSER_HEADLESS`     | `false`: a visible window, which is the product default                                                      | the host, `true` for a machine with no display                      |
| `HARNESS_BROWSER_AUTO_CONNECT` | `false`: the server launches Chrome on its own persistent profile                                            | the host, `true` to attach to a Chrome the user already has running |

So the daemon starts the engine as `opencode acp` and sets none of these. What it still owns is
everything outside this directory: the session's profile and the permission switch (HOST-12),
connector MCP configuration (HOST-11), triggering the consolidation pass below (T-15).

## The model gateway

The platform gateway is the only provider the product has (ENG-12, RULE-02), and its address is
defined here so that a packaged install talks to the right place without anything being written into
a user's config file. `baseURL` is the one fact this file fixes; `streaming: false` is how the engine
is told the gateway answers only complete responses (one completion is requested and replayed as a
stream). Nothing about the user is here.

The key is the user's, entered once in the client's provider settings and stored by the engine's
auth store (`auth.json`, `type: "api"`); `Provider` fills `options.apiKey` from it. The models are
the gateway's: with a key present the engine lists them from the gateway's own `GET /models`
(OpenAI-compatible shape, `src/provider/gateway.ts`), limits included, so the catalog is never
written down here or in a user's file. A model a configuration layer also names keeps the
configured values. The user picks the model in the session, as with any provider.

Fail closed, not fail quiet. Until the key is there the gateway is not offered at all rather than
sent to the wire to come back as a 401: `Provider` drops it from the list, and the provider HTTP
handler shows it to the client from this file (address and name, no models) so the client has an
entry to configure. A listing the gateway refuses (a wrong key answers 401) is logged and leaves the
gateway unoffered the same way; the client reports that the key saved but no model came back. A
shipped file that lost `baseURL` is refused by name:

```
The model gateway is not configured: baseURL is missing from the product configuration.
```

A model the listing describes without limits gets conservative defaults rather than a guess about
that model.

A built bundle is the one case that needs care: the engine locates both this directory and the
browser package relative to the executable, so `product/` and `node_modules/chrome-devtools-mcp` have
to ship next to it. Only an entry path that exists is passed on, and an explicit one is never replaced
by another build: a host that names a file it does not have gets no browser rather than a different
browser. With nothing to pass on the command would carry an empty argument, and the engine refuses to
start a server whose command did not fully resolve rather than spawning `node ""` — browser tools are
then absent instead of broken.

The memory directory holds `MEMORY.md` plus one file per fact. The engine creates it if it is
missing. It never leaves the machine.

## Keys used, and what each one buys

- `provider.platform`, `model`, `enabled_providers` — the model gateway, above.
- `instructions: ["{env:HARNESS_MEMORY_DIR}/MEMORY.md"]` — the index is injected into every agent's
  system prompt. Instructions are resolved per session, not per profile, which is what makes one
  memory shared by every profile (RULE-11).
- `skills.paths: ["{env:HARNESS_PRODUCT_DIR}/skills"]` — registers the product skills. Redundant by
  design: being a configuration directory already makes `skills/*/SKILL.md` discoverable, and the
  explicit path keeps them working if the host points the configuration directory elsewhere.
- `mcp.browser` — browser use (ENG-04): the product ships `chrome-devtools-mcp` (a pinned dependency
  of this package, so nothing is fetched at run time) and runs it with Node against the Chrome the
  user already has installed. The server exposes its tools to the model as `browser_*`, for example
  `browser_navigate_page` and `browser_take_snapshot`. Nothing in the product interface offers a
  choice of server (T-04).
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
- `default_agent: "default"` — the product default profile (ENG-17), the blank agent every session
  falls under when none is chosen.
- `agent.build.disable`, `agent.plan.disable` — upstream's coding modes are switched off (ENG-22): a
  session binds one agent for life, and the plan/build hand-off is a mode switch inside one session.
  `dream` carries `hidden: true` for the same reason: it is the host's, not a choice the user makes.
- User-created agents are not here: `POST /global/agent` writes them to the user's global
  configuration directory (ENG-21), the same `agent/<name>.md` shape as `dream.md`, always
  `mode: primary` and with no permission block, so they inherit the default profile's rules.
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
- **The engine writes into its own configuration directory.** A configuration directory gets a
  `.gitignore` and a background `@opencode-ai/plugin` install, this one included. Both failures are
  logged and otherwise ignored, so a read-only install still works; the `.gitignore` that would be
  written is checked in so a source checkout stays clean.
- **browser use needs a Chrome on the machine.** The server drives the user's installed Chrome rather
  than downloading one (TD-14), so there is nothing to fall back on when none is installed;
  `playwright-mcp` is the noted alternative for that case (T-04).
