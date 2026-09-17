// Agent-owned skills (ENG-25): a skill under `<user config>/agent-skills/<agent>/` is listed for
// that agent only, appears without a restart, and only that agent's file tools may write there.
import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Global } from "@opencode-ai/core/global"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
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
  Layer.mergeAll(
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
    LayerNode.compile(CrossSpawnSpawner.node),
    LayerNode.compile(EventV2Bridge.node),
  ),
)

const skillFile = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nSteps for ${name}.\n`

const writeSkill = (dir: string, name: string) =>
  Effect.promise(async () => {
    await fs.mkdir(path.join(dir, name), { recursive: true })
    await fs.writeFile(path.join(dir, name, "SKILL.md"), skillFile(name, `Use for ${name}.`))
  })

const names = (list: readonly { name: string }[]) => list.map((item) => item.name).toSorted()

const agentConfig = { agent: { huhu: { description: "Huhu" }, other: { description: "Other" } } }

afterEach(async () => {
  await disposeAllInstances()
  await fs.rm(Skill.agentSkillsRoot(), { recursive: true, force: true })
  await fs.rm(path.join(Global.Path.config, "skills"), { recursive: true, force: true })
})

describe("agent skills", () => {
  it.instance(
    "ENG-25: a skill in an agent's directory is listed for that agent only; shared ones for all",
    () =>
      Effect.gen(function* () {
        yield* writeSkill(Skill.agentSkillsDir("huhu"), "huhu-ui")
        yield* writeSkill(path.join(Global.Path.config, "skills"), "shared-review")
        const skill = yield* Skill.Service
        const agents = yield* Agent.Service
        const huhu = yield* agents.get("huhu")
        const other = yield* agents.get("other")
        const blank = yield* agents.get("default")

        expect(names(yield* skill.available(huhu))).toContain("huhu-ui")
        expect(names(yield* skill.available(huhu))).toContain("shared-review")
        expect(names(yield* skill.available(other))).not.toContain("huhu-ui")
        expect(names(yield* skill.available(other))).toContain("shared-review")
        expect(names(yield* skill.available(blank))).not.toContain("huhu-ui")
        expect((yield* skill.get("huhu-ui"))?.owner).toBe("huhu")
        expect((yield* skill.get("shared-review"))?.owner).toBeUndefined()
      }),
    { config: agentConfig },
  )

  it.instance(
    "ENG-25: a skill written while the engine runs is listed on the next call, no restart",
    () =>
      Effect.gen(function* () {
        const skill = yield* Skill.Service
        const agents = yield* Agent.Service
        const huhu = yield* agents.get("huhu")
        expect(names(yield* skill.available(huhu))).not.toContain("huhu-late")

        yield* writeSkill(Skill.agentSkillsDir("huhu"), "huhu-late")
        expect(names(yield* skill.available(huhu))).toContain("huhu-late")
        expect((yield* skill.require("huhu-late")).owner).toBe("huhu")

        yield* Effect.promise(() => fs.rm(path.join(Skill.agentSkillsDir("huhu"), "huhu-late"), { recursive: true }))
        expect(names(yield* skill.available(huhu))).not.toContain("huhu-late")
      }),
    { config: agentConfig },
  )

  it.instance(
    "ENG-25: an agent's file tools may write its own skills directory and no other agent's",
    () =>
      Effect.gen(function* () {
        const agents = yield* Agent.Service
        const huhu = yield* agents.get("huhu")
        const own = path.join(Skill.agentSkillsDir("huhu"), "huhu-ui", "SKILL.md")
        const theirs = path.join(Skill.agentSkillsDir("other"), "other-ui", "SKILL.md")
        const action = (permission: string, pattern: string) =>
          Permission.evaluate(permission, pattern, huhu.permission).action

        expect(action("edit", own)).toBe("allow")
        expect(action("read", own)).toBe("allow")
        expect(action("external_directory", own)).toBe("allow")
        expect(action("edit", theirs)).toBe("deny")
        expect(action("read", theirs)).toBe("deny")
        expect(action("external_directory", theirs)).toBe("deny")
        expect(action("bash", `cat ${theirs}`)).toBe("deny")
        expect(action("bash", `ls ${Skill.agentSkillsRoot()}`)).toBe("deny")
        // A profile-level blanket allow does not widen the other agent's directory.
        const widened = Permission.merge(Permission.fromConfig({ "*": "allow" }), huhu.permission)
        expect(Permission.evaluate("edit", theirs, widened).action).toBe("deny")
        const ruleset: PermissionV1.Ruleset = huhu.permission
        expect(ruleset.length).toBeGreaterThan(0)
      }),
    { config: agentConfig },
  )
})
