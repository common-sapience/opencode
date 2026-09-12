// Agent profiles and their tool/skill whitelists (ENG-17, ENG-18) plus the host's
// permission confirmation switch (PERM-08). A profile is an agent definition; its whitelist
// is that definition's permission ruleset, so these tests assert on rulesets and on the tool
// list the model is given, never on a second mechanism.
import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Effect, Layer } from "effect"
import path from "path"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { McpCatalog } from "../../src/mcp/catalog"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { SessionID } from "../../src/session/schema"
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
        RuntimeFlags.node,
        Permission.node,
      ]),
    ),
    LayerNode.compile(EventV2Bridge.node),
  ),
)

// The built-in tool ids, as the registry exposes them to the model. plan_enter and plan_exit are
// left out: they are the plan profile's mode transitions, not tools a profile grants.
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

function profile(name: string) {
  return Agent.Service.use((svc) => svc.get(name))
}

function action(ruleset: PermissionV1.Ruleset, permission: string, pattern = "*") {
  return Permission.evaluate(permission, pattern, ruleset).action
}

// The model only sees tools whose last matching rule is not a blanket deny.
function hidden(agent: Agent.Info) {
  return [...Permission.disabled(ALL_TOOLS, agent.permission)].toSorted()
}

function writeSkill(directory: string, name: string) {
  return Effect.promise(() =>
    Bun.write(
      path.join(directory, ".opencode", "skill", name, "SKILL.md"),
      ["---", `name: ${name}`, `description: Fixture skill ${name}.`, "---", "", "Body."].join("\n"),
    ),
  )
}

const withPermissionEnv = <A, E, R>(value: string, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env["OPENCODE_PERMISSION"]
      process.env["OPENCODE_PERMISSION"] = value
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env["OPENCODE_PERMISSION"]
        else process.env["OPENCODE_PERMISSION"] = previous
      }),
  )

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("ENG-17: the default profile is a native primary agent with no prompt override", () =>
  Effect.gen(function* () {
    const agent = yield* profile("default")
    expect(agent).toBeDefined()
    expect(agent!.mode).toBe("primary")
    expect(agent!.native).toBe(true)
    expect(agent!.hidden).toBeUndefined()
    // No prompt of its own, so the provider default system prompt stays in place.
    expect(agent!.prompt).toBeUndefined()
    expect(agent!.model).toBeUndefined()
  }),
)

it.instance("ENG-17: the default profile is the default agent and upstream profiles stay available", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service.use((svc) => svc.list())
    const primary = agents.filter((item) => item.mode === "primary" && item.hidden !== true).map((item) => item.name)
    expect(primary[0]).toBe("default")
    expect(primary).toContain("build")
    expect(primary).toContain("plan")
    expect(yield* Agent.Service.use((svc) => svc.defaultAgent())).toBe("default")
  }),
)

it.instance(
  "ENG-17: a config profile overrides the default agent without replacing the default profile",
  () =>
    Effect.gen(function* () {
      expect(yield* Agent.Service.use((svc) => svc.defaultAgent())).toBe("locked_down")
      expect(yield* profile("default")).toBeDefined()
    }),
  {
    config: {
      default_agent: "locked_down",
      agent: { locked_down: { description: "Allowlist profile", mode: "primary" } },
    },
  },
)

it.instance("ENG-17: the default profile allows asking the user a question", () =>
  Effect.gen(function* () {
    const agent = yield* profile("default")
    expect(action(agent!.permission, "question")).toBe("allow")
  }),
)

it.instance(
  "ENG-18: a profile with no tool rules sees every tool and skill",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      yield* writeSkill(instance.directory, "fixture_skill")
      const agent = yield* profile("open_profile")
      expect(agent).toBeDefined()
      expect(hidden(agent!)).toEqual([])
      for (const tool of ALL_TOOLS) expect(action(agent!.permission, tool)).toBe("allow")
      const skills = yield* Skill.Service.use((svc) => svc.available(agent))
      expect(skills.map((item) => item.name)).toContain("fixture_skill")
      expect(action(agent!.permission, "skill", "fixture_skill")).toBe("allow")
    }),
  {
    config: { agent: { open_profile: { description: "No tool rules at all" } } },
  },
)

it.instance(
  "ENG-18: a profile denying one tool cannot call it and the rest stay available",
  () =>
    Effect.gen(function* () {
      const agent = yield* profile("no_bash")
      expect(action(agent!.permission, "bash")).toBe("deny")
      expect(hidden(agent!)).toEqual(["bash"])
      expect(action(agent!.permission, "edit")).toBe("allow")
      expect(action(agent!.permission, "read")).toBe("allow")
    }),
  {
    config: { agent: { no_bash: { permission: { bash: "deny" } } } },
  },
)

it.instance(
  "ENG-18: an allowlist profile hides every tool it did not allow",
  () =>
    Effect.gen(function* () {
      const agent = yield* profile("allowlist")
      expect(hidden(agent!)).toEqual(
        [
          "apply_patch",
          "bash",
          "edit",
          "lsp",
          "question",
          "skill",
          "task",
          "todowrite",
          "webfetch",
          "websearch",
          "write",
        ].toSorted(),
      )
      expect(action(agent!.permission, "read")).toBe("allow")
      expect(action(agent!.permission, "grep")).toBe("allow")
      expect(action(agent!.permission, "glob")).toBe("allow")
      expect(action(agent!.permission, "edit")).toBe("deny")
    }),
  {
    config: {
      agent: {
        allowlist: {
          permission: { "*": "deny", read: "allow", grep: "allow", glob: "allow" },
        },
      },
    },
  },
)

it.instance(
  "ENG-18: skill rules select skills by name",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      yield* writeSkill(instance.directory, "kept_skill")
      yield* writeSkill(instance.directory, "dropped_skill")
      const agent = yield* profile("some_skills")
      expect(action(agent!.permission, "skill", "kept_skill")).toBe("allow")
      expect(action(agent!.permission, "skill", "dropped_skill")).toBe("deny")
      const names = (yield* Skill.Service.use((svc) => svc.available(agent))).map((item) => item.name)
      expect(names).toContain("kept_skill")
      expect(names).not.toContain("dropped_skill")
      // A per-skill deny is not a blanket deny, so the skill tool itself stays visible.
      expect(hidden(agent!)).toEqual([])
    }),
  {
    config: {
      agent: {
        some_skills: {
          permission: { skill: { "*": "allow", dropped_skill: "deny" } },
        },
      },
    },
  },
)

it.instance(
  "ENG-18: an allowlist profile can drop the skill tool entirely",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      yield* writeSkill(instance.directory, "fixture_skill")
      const agent = yield* profile("no_skills")
      expect(hidden(agent!)).toContain("skill")
      expect(yield* Skill.Service.use((svc) => svc.available(agent))).toEqual([])
    }),
  {
    config: { agent: { no_skills: { permission: { skill: "deny" } } } },
  },
)

it.instance(
  "ENG-18: task rules select subagents by name",
  () =>
    Effect.gen(function* () {
      const agent = yield* profile("one_subagent")
      expect(action(agent!.permission, "task", "explore")).toBe("allow")
      expect(action(agent!.permission, "task", "general")).toBe("deny")
      expect(hidden(agent!)).toEqual([])
    }),
  {
    config: {
      agent: {
        one_subagent: {
          permission: { task: { "*": "allow", general: "deny" } },
        },
      },
    },
  },
)

it.instance(
  "ENG-18: MCP tools are whitelisted under their server_tool name",
  () =>
    Effect.gen(function* () {
      const allowed = McpCatalog.toolName("browser", "navigate")
      const denied = McpCatalog.toolName("browser", "screenshot")
      expect(allowed).toBe("browser_navigate")
      expect(denied).toBe("browser_screenshot")
      const agent = yield* profile("mcp_profile")
      expect(action(agent!.permission, allowed)).toBe("allow")
      expect(action(agent!.permission, denied)).toBe("deny")
      const tools = { [allowed]: {}, [denied]: {} }
      expect(Object.keys(Permission.visibleTools(tools, agent!.permission))).toEqual([allowed])
    }),
  {
    config: {
      agent: {
        mcp_profile: {
          permission: { browser_screenshot: "deny" },
        },
      },
    },
  },
)

it.instance("PERM-08: the permission switch off asks nothing for a bash and edit run", () =>
  withPermissionEnv(
    JSON.stringify({ "*": "allow" }),
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const events = yield* EventV2Bridge.Service
      const asked: string[] = []
      const unsubscribe = yield* events.listen((event) =>
        Effect.sync(() => {
          if (event.type === PermissionV1.Event.Asked.type) asked.push(event.type)
        }),
      )
      const agent = yield* profile("default")
      const permission = yield* Permission.Service
      const file = path.join(instance.directory, "notes.txt")
      yield* permission.ask({
        sessionID: SessionID.make("ses_perm08"),
        permission: "bash",
        patterns: ["git status"],
        always: ["git status"],
        metadata: {},
        ruleset: agent!.permission,
      })
      yield* permission.ask({
        sessionID: SessionID.make("ses_perm08"),
        permission: "edit",
        patterns: [file],
        always: [file],
        metadata: {},
        ruleset: agent!.permission,
      })
      expect(asked).toEqual([])
      expect(yield* permission.list()).toEqual([])
      yield* unsubscribe
    }),
  ),
)

it.instance("PERM-08: the sensitive file rule still applies with the permission switch off", () =>
  withPermissionEnv(
    JSON.stringify({ "*": "allow" }),
    Effect.gen(function* () {
      const agent = yield* profile("default")
      expect(action(agent!.permission, "bash")).toBe("allow")
      expect(action(agent!.permission, "read", "/work/src/index.ts")).toBe("allow")
      expect(action(agent!.permission, "read", "/work/.env")).toBe("ask")
      expect(action(agent!.permission, "read", "/work/.env.local")).toBe("ask")
      expect(action(agent!.permission, "read", "/work/.env.example")).toBe("allow")
    }),
  ),
)

it.instance(
  "PERM-08: the sensitive file rule survives a blanket allow in the config",
  () =>
    Effect.gen(function* () {
      const agent = yield* profile("default")
      expect(action(agent!.permission, "read", "/work/.env")).toBe("ask")
    }),
  { config: { permission: { "*": "allow" } } },
)
