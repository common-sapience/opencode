// The product has to work with nothing configured (ENG-04, ENG-19): the engine finds its own shipped
// `packages/opencode/product` directory, and every variable that configuration substitutes has a
// value before it is read. These tests remove the environment the other product tests set up, so what
// they drive is the resolution the daemon gets for free.
import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import { Effect, Layer } from "effect"
import { existsSync } from "fs"
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
import { Skill } from "../../src/skill"
import { disposeAllInstances } from "../fixture/fixture"
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
        RuntimeFlags.node,
        Permission.node,
      ]),
    ),
    LayerNode.compile(EventV2Bridge.node),
  ),
)

const PRODUCT_DIR = path.join(import.meta.dir, "..", "..", "product")

// Everything the host may set about the product. A test that wants the zero-config path removes all
// of it, including what test/preload.ts sets to keep the rest of the suite away from this directory.
const PRODUCT_ENV = [
  "OPENCODE_CONFIG_DIR",
  "HARNESS_PRODUCT_DIR",
  "HARNESS_BROWSER_MCP_ENTRY",
  "HARNESS_BROWSER_HEADLESS",
  "HARNESS_BROWSER_AUTO_CONNECT",
]

const withEnv = <A, E, R>(vars: Record<string, string | undefined>, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous: Record<string, string | undefined> = {}
      for (const [key, value] of Object.entries(vars)) {
        previous[key] = process.env[key]
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
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

const unset = (...keep: [string, string][]) =>
  Object.fromEntries([...PRODUCT_ENV.map((key) => [key, undefined] as const), ...keep]) as Record<
    string,
    string | undefined
  >

const browser = Effect.gen(function* () {
  const config = yield* Config.use.get()
  const server = config.mcp?.["browser"]
  expect(server).toBeDefined()
  expect(server && "type" in server ? server.type : undefined).toBe("local")
  return server as ConfigMCPV1.Local
})

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("ENG-19: the product configuration directory is discovered with no environment set", () =>
  withEnv(
    unset(),
    Effect.gen(function* () {
      const directories = yield* Config.use.directories()
      expect(directories).toContain(path.resolve(PRODUCT_DIR))

      // Resolving the directory also writes it back, so `{env:HARNESS_PRODUCT_DIR}` can never
      // substitute to nothing: an empty value would turn `<dir>/skills` into `/skills`.
      expect(process.env["HARNESS_PRODUCT_DIR"]).toBe(path.resolve(PRODUCT_DIR))

      const config = yield* Config.use.get()
      expect(config.default_agent).toBe("default")
      expect(config.skills?.paths).toEqual([path.join(path.resolve(PRODUCT_DIR), "skills")])

      // The directory really is a configuration directory: its skills and its agent are registered.
      const skills = yield* Skill.Service.use((svc) => svc.all())
      expect(skills.map((item) => item.name)).toContain("memory")
      expect(skills.map((item) => item.name)).toContain("dream")
      expect(yield* Agent.Service.use((svc) => svc.get("dream"))).toBeDefined()

      // No pattern widened: every memory rule still names the memory directory it was written for.
      const memory = process.env["HARNESS_MEMORY_DIR"]
      expect(memory).toBeTruthy()
      for (const rules of Object.values(config.permission ?? {})) {
        if (typeof rules === "string") continue
        for (const pattern of Object.keys(rules)) expect(pattern).toContain(memory!)
      }
    }),
  ),
)

it.instance("ENG-04: the browser MCP server resolves its entry from the engine's own install", () =>
  withEnv(
    unset(),
    Effect.gen(function* () {
      const server = yield* browser
      expect(server.enabled).not.toBe(false)

      const command = server.command
      expect(command[0]).toBe("node")
      expect(command[1]).toContain("chrome-devtools-mcp")
      expect(existsSync(command[1]!)).toBe(true)
      expect(process.env["HARNESS_BROWSER_MCP_ENTRY"]).toBe(command[1])

      // A window, and the server's own Chrome: the product defaults, written out so that no argument
      // is left half-substituted.
      expect(command).toContain("--headless=false")
      expect(command).toContain("--autoConnect=false")
      expect(command.some((argument) => argument.trim() === "")).toBe(false)
    }),
  ),
)

it.instance("ENG-04: a browser entry that does not exist disables the server", () =>
  withEnv(
    unset(["HARNESS_BROWSER_MCP_ENTRY", path.join(os.tmpdir(), "harness-no-such-browser-entry.js")]),
    Effect.gen(function* () {
      const server = yield* browser
      // Refused, not spawned: `node ""` would start a REPL, and another build is not a substitute for
      // the one the host asked for.
      expect(server.enabled).toBe(false)
      expect(process.env["HARNESS_BROWSER_MCP_ENTRY"]).toBeUndefined()
    }),
  ),
)

it.instance("ENG-04: the host's own browser entry wins", () =>
  withEnv(
    unset(["HARNESS_BROWSER_MCP_ENTRY", path.join(import.meta.dir, "..", "..", "product", "README.md")]),
    Effect.gen(function* () {
      const server = yield* browser
      expect(server.enabled).not.toBe(false)
      expect(server.command[1]).toBe(path.join(import.meta.dir, "..", "..", "product", "README.md"))
    }),
  ),
)
