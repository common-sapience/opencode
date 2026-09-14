// Agent profiles and their tool/skill whitelists (ENG-17, ENG-18) plus the host's
// permission confirmation switch (PERM-08). A profile is an agent definition; its whitelist
// is that definition's permission ruleset, so these tests assert on rulesets and on the tool
// list the model is given, never on a second mechanism.
import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
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

// One file per credential rule the product ships (PERM-04), spelled the way a tool would ask.
const SECRET_FILES = [
  "/work/.env",
  "/work/.env.local",
  "/work/.env.example",
  "/work/certs/server.pem",
  "/work/certs/server.key",
  "/work/certs/bundle.p12",
  "/work/certs/bundle.pfx",
  "/home/user/.ssh/id_ed25519",
  "/home/user/.gnupg/secring.gpg",
  "/home/user/.aws/credentials",
  "/home/user/.netrc",
  "/home/user/.npmrc",
  "/home/user/.local/share/opencode/auth.json",
  "/home/user/.local/share/opencode/mcp-auth.json",
]

const waitForPending = (count: number) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* Effect.gen(function* () {
      while (true) {
        const list = yield* permission.list()
        if (list.length === count) return list
        yield* Effect.sleep("10 millis")
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: "5 seconds",
        orElse: () => Effect.fail(new Error(`timed out waiting for ${count} pending permission request(s)`)),
      }),
    )
  })

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

// PERM-04. A credential file is refused, not asked about, so the refusal does not depend on
// anyone being there to answer: with the switch off (a blanket allow) an `ask` would be let
// through on the spot, and with it on the refusal would be one answer away.
it.instance("PERM-04: credential files are denied with the permission switch off", () =>
  withPermissionEnv(
    JSON.stringify({ "*": "allow" }),
    Effect.gen(function* () {
      const agent = yield* profile("default")
      expect(action(agent!.permission, "bash")).toBe("allow")
      expect(action(agent!.permission, "read", "/work/src/index.ts")).toBe("allow")
      for (const file of SECRET_FILES) {
        expect(action(agent!.permission, "read", file)).toBe("deny")
        expect(action(agent!.permission, "edit", file)).toBe("deny")
      }
    }),
  ),
)

it.instance("PERM-04: credential files are denied with the permission switch on", () =>
  Effect.gen(function* () {
    const agent = yield* profile("default")
    expect(action(agent!.permission, "read", "/work/src/index.ts")).toBe("allow")
    for (const file of SECRET_FILES) {
      expect(action(agent!.permission, "read", file)).toBe("deny")
      expect(action(agent!.permission, "edit", file)).toBe("deny")
    }
  }),
)

// The file tools ask on the path relative to the worktree, so the relative and the `../` spelling
// of the same file have to be refused too, not only the absolute one.
it.instance("PERM-04: the deny follows the path spelling the file tools ask with", () =>
  Effect.gen(function* () {
    const agent = yield* profile("default")
    for (const spelling of [".env", "../.env", "../../home/user/.ssh/id_ed25519", "config/service.pem"]) {
      expect(action(agent!.permission, "read", spelling)).toBe("deny")
    }
  }),
)

it.instance(
  "PERM-04: a blanket allow in the user config does not reopen a credential file",
  () =>
    Effect.gen(function* () {
      const agent = yield* profile("default")
      expect(action(agent!.permission, "read", "/work/.env")).toBe("deny")
      expect(action(agent!.permission, "edit", "/work/.env")).toBe("deny")
    }),
  { config: { permission: { "*": "allow", read: "allow", edit: "allow" } } },
)

it.instance(
  "PERM-04: a profile that allows reading everything does not reopen a credential file",
  () =>
    Effect.gen(function* () {
      const agent = yield* profile("wide_open")
      expect(action(agent!.permission, "read", "/work/src/index.ts")).toBe("allow")
      expect(action(agent!.permission, "read", "/work/.env")).toBe("deny")
      expect(action(agent!.permission, "edit", "/work/.env")).toBe("deny")
    }),
  { config: { agent: { wide_open: { permission: { "*": "allow", read: "allow", edit: "allow" } } } } },
)

// An allowlist profile still hides the tools it did not allow: the credential rules are appended
// after it, and a ruleset of denies must not make a denied tool visible again (ENG-18).
it.instance(
  "PERM-04: appending the credential rules leaves an allowlist profile's hidden tools hidden",
  () =>
    Effect.gen(function* () {
      const agent = yield* profile("allowlist")
      expect(hidden(agent!)).toContain("edit")
      expect(hidden(agent!)).toContain("write")
      expect(hidden(agent!)).toContain("bash")
      expect(hidden(agent!)).not.toContain("read")
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

// PERM-04's "not overridable by always allow". The read and edit tools ask with `always: ["*"]`,
// so one "always" answer on an ordinary file would otherwise approve every path for that tool.
it.instance(
  "PERM-04: an always answer for the read tool does not reopen a credential file",
  () =>
    Effect.gen(function* () {
      const agent = yield* profile("asks_to_read")
      const permission = yield* Permission.Service
      const sessionID = SessionID.make("ses_perm04_always")
      const fiber = yield* permission
        .ask({
          id: PermissionV1.ID.make("per_perm04_always"),
          sessionID,
          permission: "read",
          patterns: ["notes.txt"],
          always: ["*"],
          metadata: {},
          ruleset: agent!.permission,
        })
        .pipe(Effect.forkScoped)
      yield* waitForPending(1)
      yield* permission.reply({ requestID: PermissionV1.ID.make("per_perm04_always"), reply: "always" })
      yield* Fiber.join(fiber)

      // The same tool, now approved for every pattern, still cannot reach the credential file.
      const exit = yield* permission
        .ask({
          sessionID,
          permission: "read",
          patterns: [".env"],
          always: ["*"],
          metadata: {},
          ruleset: agent!.permission,
        })
        .pipe(Effect.exit)
      if (!Exit.isFailure(exit)) throw new Error("the credential file was not refused")
      expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(yield* permission.list()).toEqual([])
    }),
  { config: { agent: { asks_to_read: { permission: { read: "ask" } } } } },
)
