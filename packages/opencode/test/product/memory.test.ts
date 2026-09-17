// The product's shared auto-memory (ENG-19, RULE-11). Memory is a configuration directory, not a
// new engine mechanism: the index reaches every agent through an instruction file, the write and
// consolidation procedures are skills, and the consolidation profile is an agent definition. These
// tests drive the real `packages/opencode/product` directory so the shipped files are what is
// asserted on.
import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Instruction } from "../../src/session/instruction"
import { Skill } from "../../src/skill"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.provideMerge(
    LayerNode.compile(
      LayerNode.group([
        Agent.node,
        Plugin.node,
        Provider.node,
        Auth.node,
        Config.node,
        Skill.node,
        Instruction.node,
        RuntimeFlags.node,
        Permission.node,
      ]),
    ),
    LayerNode.compile(EventV2Bridge.node),
  ),
)

const PRODUCT_DIR = path.join(import.meta.dir, "..", "..", "product")

const INDEX_LINE = "- [Fixture fact](fixture-fact.md) — the user writes Go and is new to this repo"

const FACT = [
  "---",
  "name: fixture-fact",
  "description: The user writes Go and is new to this repository's frontend.",
  "metadata:",
  "  type: user",
  "---",
  "",
  "Deep Go expertise, new to the frontend of this repository.",
].join("\n")

const ALL_TOOLS = [
  "apply_patch",
  "bash",
  "edit",
  "glob",
  "grep",
  "lsp",
  "question",
  "read",
  "skill",
  "task",
  "todowrite",
  "webfetch",
  "websearch",
  "write",
]

const BLANKET_ALLOW = JSON.stringify({ "*": "allow" })

function action(ruleset: PermissionV1.Ruleset, permission: string, pattern = "*") {
  return Permission.evaluate(permission, pattern, ruleset).action
}

function hidden(agent: Agent.Info) {
  return [...Permission.disabled(ALL_TOOLS, agent.permission)].toSorted()
}

function profile(name: string) {
  return Agent.Service.use((svc) => svc.get(name))
}

function writeMemory(directory: string) {
  return Effect.promise(async () => {
    await fs.mkdir(directory, { recursive: true })
    await Bun.write(path.join(directory, "MEMORY.md"), INDEX_LINE + "\n")
    await Bun.write(path.join(directory, "fixture-fact.md"), FACT)
    return directory
  })
}

// Copies the shipped product directory somewhere writable: the engine treats a configuration
// directory as its own (it drops a .gitignore and installs the plugin package into it), so the
// repository copy is never handed to it directly.
const stagedProduct = Effect.acquireRelease(
  Effect.promise(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-product-"))
    const product = path.join(root, "product")
    await fs.cp(PRODUCT_DIR, product, { recursive: true })
    return { root, product }
  }),
  (value) => Effect.promise(() => fs.rm(value.root, { recursive: true, force: true })),
)

const withEnv = <A, E, R>(vars: Record<string, string>, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous: Record<string, string | undefined> = {}
      for (const [key, value] of Object.entries(vars)) {
        previous[key] = process.env[key]
        process.env[key] = value
      }
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }),
  )

// The host's contract: the product directory is a configuration directory, and the shared memory
// directory is named by HARNESS_MEMORY_DIR. No configuration is read before both are in place.
const withProduct = <A, E, R>(
  body: (memory: string) => Effect.Effect<A, E, R>,
  options: { memory?: (root: string) => string; env?: Record<string, string> } = {},
) =>
  Effect.gen(function* () {
    const staged = yield* stagedProduct
    const memory = yield* writeMemory(options.memory?.(staged.root) ?? path.join(staged.root, "memory"))
    return yield* withEnv(
      {
        OPENCODE_CONFIG_DIR: staged.product,
        HARNESS_PRODUCT_DIR: staged.product,
        HARNESS_MEMORY_DIR: memory,
        ...options.env,
      },
      body(memory),
    )
  })

// The consolidation pass runs with the memory directory as its working directory, which is how
// "inside the memory directory" becomes expressible as a permission rule at all.
const withDreamSession = <A, E, R>(body: (memory: string) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    return yield* withProduct(body, { memory: () => instance.directory })
  })

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("RULE-11: the memory index reaches the resolved system instructions", () =>
  withProduct(() =>
    Effect.gen(function* () {
      const instructions = yield* Instruction.Service.use((svc) => svc.system())
      const memory = instructions.filter((item) => item.includes("MEMORY.md"))
      expect(memory).toHaveLength(1)
      expect(memory[0]).toContain(INDEX_LINE)
      // The index is a pointer list, so the fact itself is read on demand and not in every prompt.
      expect(memory[0]).not.toContain("Deep Go expertise")
    }),
  ),
)

it.instance("ENG-19: the product config registers the memory skill and the dream skill", () =>
  withProduct(() =>
    Effect.gen(function* () {
      const skills = yield* Skill.Service.use((svc) => svc.all())
      const names = skills.map((item) => item.name)
      expect(names).toContain("memory")
      expect(names).toContain("dream")

      const memory = skills.find((item) => item.name === "memory")!
      expect(memory.description).toBeDefined()
      expect(memory.content).toContain("one fact")

      const agent = yield* profile("default")
      const available = yield* Skill.Service.use((svc) => svc.available(agent))
      expect(available.map((item) => item.name)).toContain("memory")
    }),
  ),
)

it.instance("ENG-23: the product config turns file snapshots off", () =>
  withProduct(() =>
    Effect.gen(function* () {
      // Every session works in the home directory (D-04); a git snapshot of it before each
      // message takes tens of seconds and serialises on one index lock.
      expect((yield* Config.Service.use((svc) => svc.get())).snapshot).toBe(false)
    }),
  ),
)

it.instance("ENG-22: the product config disables the upstream build and plan modes", () =>
  withProduct(() =>
    Effect.gen(function* () {
      const names = (yield* Agent.Service.use((svc) => svc.list())).map((item) => item.name)
      expect(names).toContain("default")
      expect(names).not.toContain("build")
      expect(names).not.toContain("plan")
    }),
  ),
)

it.instance("ENG-22: the dream profile is a primary agent the host selects, hidden from the user's list", () =>
  withProduct(() =>
    Effect.gen(function* () {
      const agent = yield* profile("dream")
      expect(agent).toBeDefined()
      expect(agent!.mode).toBe("primary")
      expect(agent!.hidden).toBe(true)
      expect(agent!.prompt).toContain("dream")
      // The product default stays the default agent; dream is chosen per session.
      expect(yield* Agent.Service.use((svc) => svc.defaultAgent())).toBe("default")
    }),
  ),
)

it.instance("ENG-19: the dream profile edits markdown inside the memory directory and nothing else", () =>
  withDreamSession(() =>
    Effect.gen(function* () {
      const agent = yield* profile("dream")
      const ruleset = agent!.permission

      expect(action(ruleset, "edit", "MEMORY.md")).toBe("allow")
      expect(action(ruleset, "edit", "fixture-fact.md")).toBe("allow")
      expect(action(ruleset, "read", "fixture-fact.md")).toBe("allow")

      // Anything outside the working directory is reached through external_directory, which is shut.
      expect(action(ruleset, "external_directory", path.join(os.homedir(), ".ssh", "*"))).toBe("deny")
      expect(action(ruleset, "external_directory", path.join(os.tmpdir(), "*"))).toBe("deny")
      // And inside it, only memory files are writable.
      expect(action(ruleset, "edit", "id_rsa")).toBe("deny")
      expect(action(ruleset, "edit", "script.sh")).toBe("deny")

      // A consolidation pass has no shell, no network, no subagents and nobody to ask.
      expect(hidden(agent!)).toEqual(
        ["bash", "grep", "lsp", "question", "task", "todowrite", "webfetch", "websearch"].toSorted(),
      )
      expect(action(ruleset, "skill", "dream")).toBe("allow")
      expect(action(ruleset, "skill", "memory")).toBe("deny")
    }),
  ),
)

it.instance(
  "RULE-11: an unrelated profile resolves the same memory index",
  () =>
    withProduct(() =>
      Effect.gen(function* () {
        const unrelated = yield* profile("unrelated")
        expect(unrelated).toBeDefined()
        expect(unrelated!.prompt).toBeUndefined()

        // Instructions are resolved per session and never per profile, which is what makes one
        // memory directory shared by every agent on the machine.
        const instructions = yield* Instruction.Service.use((svc) => svc.system())
        expect(instructions.some((item) => item.includes(INDEX_LINE))).toBe(true)

        const paths = yield* Instruction.Service.use((svc) => svc.systemPaths())
        expect([...paths].some((item) => item.endsWith(path.join("memory", "MEMORY.md")))).toBe(true)

        const primary = (yield* Agent.Service.use((svc) => svc.list()))
          .filter((item) => item.mode !== "subagent" && item.hidden !== true)
          .map((item) => item.name)
        expect(primary).toContain("default")
        expect(primary).toContain("unrelated")
        // The consolidation profile is the host's, hidden from the user's list (ENG-22).
        expect(primary).not.toContain("dream")
      }),
    ),
  { config: { agent: { unrelated: { description: "A profile that knows nothing about memory" } } } },
)

it.instance("ENG-19: the memory directory is reachable by the file tools", () =>
  withProduct((memory) =>
    Effect.gen(function* () {
      const agent = yield* profile("default")
      expect(action(agent!.permission, "external_directory", path.join(memory, "*"))).toBe("allow")
      expect(action(agent!.permission, "read", path.join(memory, "fixture-fact.md"))).toBe("allow")
      expect(action(agent!.permission, "edit", path.join(memory, "fixture-fact.md"))).toBe("allow")
      // Everything else outside the worktree still needs an answer.
      expect(action(agent!.permission, "external_directory", path.join(os.homedir(), "Documents", "*"))).toBe("ask")
    }),
  ),
)

it.instance("ENG-19: the shell cannot reach the memory directory, permission switch off included", () =>
  withProduct(
    (memory) =>
      Effect.gen(function* () {
        for (const name of ["default", "dream"]) {
          const agent = yield* profile(name)
          expect(action(agent!.permission, "bash", `rm -rf ${memory}`)).toBe("deny")
          expect(action(agent!.permission, "bash", `cat ${memory}/MEMORY.md`)).toBe("deny")
        }
        // An unrelated command still runs: the host turned confirmation off.
        const fallback = yield* profile("default")
        expect(action(fallback!.permission, "bash", "ls -la")).toBe("allow")
      }),
    { env: { OPENCODE_PERMISSION: BLANKET_ALLOW } },
  ),
)
