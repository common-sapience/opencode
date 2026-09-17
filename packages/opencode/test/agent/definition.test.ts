// User-created agent definitions (ENG-21, D-02, D-06). A definition is a markdown file in the
// global configuration directory that the engine's ordinary loader picks up; this module is its one
// write path. Names are refused deny-by-default: built-ins, path separators and duplicates.
import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Exit, Cause } from "effect"
import fs from "fs/promises"
import matter from "gray-matter"
import { Agent } from "../../src/agent/agent"
import { AgentDefinition } from "../../src/agent/definition"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
  ),
)

const DESCRIPTION = "Find sources for a claim.\nCite every source you use."

afterEach(async () => {
  await disposeAllInstances()
  await fs.rm(AgentDefinition.directory(), { recursive: true, force: true })
})

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (!Exit.isFailure(exit)) return undefined
  const error = Cause.squash(exit.cause)
  return typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : undefined
}

it.live("ENG-21: writes a primary definition whose description is both summary and prompt", () =>
  Effect.gen(function* () {
    const created = yield* AgentDefinition.create({ name: "researcher", description: DESCRIPTION })
    expect(created).toEqual({ name: "researcher" })

    const parsed = matter(yield* Effect.promise(() => fs.readFile(AgentDefinition.file("researcher"), "utf8")))
    expect(parsed.data).toEqual({
      description: "Find sources for a claim.",
      mode: "primary",
      inherit_base_prompt: true,
    })
    expect(parsed.content.trim()).toBe(DESCRIPTION)
  }),
)

it.instance("ENG-21: a created definition is loaded like any other agent", () =>
  Effect.gen(function* () {
    yield* AgentDefinition.create({ name: "researcher", description: DESCRIPTION })
    const agent = yield* Agent.Service.use((svc) => svc.get("researcher"))
    expect(agent).toBeDefined()
    expect(agent.mode).toBe("primary")
    expect(agent.native).toBe(false)
    expect(agent.description).toBe("Find sources for a claim.")
    expect(agent.prompt).toBe(DESCRIPTION)
    expect(agent.inheritBasePrompt).toBe(true)
  }),
)

it.live("ENG-21: refuses built-in names, path separators, dot names and empty descriptions", () =>
  Effect.gen(function* () {
    for (const name of [...AgentDefinition.RESERVED, "a/b", "a\\b", "..", ".hidden", "", " ", "x".repeat(65)]) {
      const exit = yield* AgentDefinition.create({ name, description: DESCRIPTION }).pipe(Effect.exit)
      expect(failureTag(exit)).toBe("AgentDefinition.InvalidError")
    }
    const blank = yield* AgentDefinition.create({ name: "researcher", description: "  \n" }).pipe(Effect.exit)
    expect(failureTag(blank)).toBe("AgentDefinition.InvalidError")
    const exists = yield* Effect.promise(() =>
      fs
        .access(AgentDefinition.directory())
        .then(() => true)
        .catch(() => false),
    )
    expect(exists).toBe(false)
  }),
)

it.live("ENG-21: never overwrites an existing definition", () =>
  Effect.gen(function* () {
    yield* AgentDefinition.create({ name: "researcher", description: DESCRIPTION })
    const exit = yield* AgentDefinition.create({ name: "researcher", description: "Something else." }).pipe(Effect.exit)
    expect(failureTag(exit)).toBe("AgentDefinition.ExistsError")
    const parsed = matter(yield* Effect.promise(() => fs.readFile(AgentDefinition.file("researcher"), "utf8")))
    expect(parsed.content.trim()).toBe(DESCRIPTION)
  }),
)

it.live("ENG-21: removes only user-created definitions", () =>
  Effect.gen(function* () {
    yield* AgentDefinition.create({ name: "researcher", description: DESCRIPTION })
    expect(yield* AgentDefinition.remove("researcher")).toBe(true)
    const again = yield* AgentDefinition.remove("researcher").pipe(Effect.exit)
    expect(failureTag(again)).toBe("AgentDefinition.NotFoundError")
    for (const name of AgentDefinition.RESERVED) {
      const exit = yield* AgentDefinition.remove(name).pipe(Effect.exit)
      expect(failureTag(exit)).toBe("AgentDefinition.InvalidError")
    }
  }),
)

it.instance("ENG-21: the reserved list covers every native agent", () =>
  Effect.gen(function* () {
    const natives = (yield* Agent.Service.use((svc) => svc.list()))
      .filter((item) => item.native)
      .map((item) => item.name)
    expect(natives.length).toBeGreaterThan(0)
    for (const name of natives) expect((AgentDefinition.RESERVED as readonly string[]).includes(name)).toBe(true)
  }),
)
