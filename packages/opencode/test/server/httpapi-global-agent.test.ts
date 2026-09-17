// The create and delete agent endpoints (ENG-21, RULE-12): the client's only way to define an agent.
// A write reloads the engine the way a global config update does, so the next agent list sees it.
import { afterEach, describe, expect } from "bun:test"
import fs from "fs/promises"
import { Effect, Fiber } from "effect"
import { AgentDefinition } from "../../src/agent/definition"
import { Server } from "../../src/server/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { it } from "../lib/effect"
import { waitGlobalBusEvent } from "./global-bus"

function app() {
  return Server.Default().app
}

// A global write reloads every instance and then announces it with the global disposed event. That
// event, not the per-instance one, is when the next instance route sees the change: the instance
// entry is only removed after its disposed event, and a request in between would race the removal.
function waitReloaded() {
  return waitGlobalBusEvent({
    message: "timed out waiting for the global reload",
    predicate: (event) => event.payload.type === "global.disposed",
  })
}

const tmpdirEffect = (options: Parameters<typeof tmpdir>[0]) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir(options)),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

type AgentRow = { name: string; mode: string; description?: string; prompt?: string }

function isAgentRow(value: unknown): value is AgentRow {
  return typeof value === "object" && value !== null && "name" in value && "mode" in value
}

const listAgents = (directory: string) =>
  Effect.promise(async () => {
    const response = await Promise.resolve(app().request("/agent", { headers: { "x-opencode-directory": directory } }))
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(Array.isArray(body)).toBe(true)
    return Array.isArray(body) ? body.filter(isAgentRow) : []
  })

const post = (body: unknown) =>
  Effect.promise(() =>
    Promise.resolve(
      app().request("/global/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  )

const del = (name: string) =>
  Effect.promise(() => Promise.resolve(app().request(`/global/agent/${name}`, { method: "DELETE" })))

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
  await fs.rm(AgentDefinition.directory(), { recursive: true, force: true })
})

describe("global agent HttpApi", () => {
  it.live(
    "ENG-21: creating an agent makes it appear in the agent list, deleting removes it",
    Effect.gen(function* () {
      const tmp = yield* tmpdirEffect({ config: { formatter: false, lsp: false } })
      expect((yield* listAgents(tmp.path)).map((item) => item.name)).not.toContain("researcher")

      const disposed = yield* waitReloaded().pipe(Effect.forkScoped({ startImmediately: true }))
      const created = yield* post({ name: "researcher", description: "Find sources.\nCite them." })
      expect(created.status).toBe(200)
      expect(yield* Effect.promise(() => created.json())).toEqual({ name: "researcher" })
      yield* Fiber.join(disposed)

      const agent = (yield* listAgents(tmp.path)).find((item) => item.name === "researcher")
      expect(agent).toMatchObject({ mode: "primary", description: "Find sources." })
      expect(agent?.prompt).toContain("Cite them.")

      const gone = yield* waitReloaded().pipe(Effect.forkScoped({ startImmediately: true }))
      const removed = yield* del("researcher")
      expect(removed.status).toBe(200)
      yield* Fiber.join(gone)
      expect((yield* listAgents(tmp.path)).map((item) => item.name)).not.toContain("researcher")
    }),
    30_000,
  )

  it.live(
    "ENG-21: refuses duplicates, built-in names and path separators; refuses to delete what it did not create",
    Effect.gen(function* () {
      expect((yield* post({ name: "researcher", description: "Find sources." })).status).toBe(200)
      expect((yield* post({ name: "researcher", description: "Again." })).status).toBe(409)
      expect((yield* post({ name: "default", description: "Take over." })).status).toBe(400)
      expect((yield* post({ name: "build", description: "Take over." })).status).toBe(400)
      expect((yield* post({ name: "../escape", description: "Escape." })).status).toBe(400)
      expect((yield* post({ name: "blank", description: "   " })).status).toBe(400)
      expect((yield* post({ description: "No name." })).status).toBe(400)

      expect((yield* del("default")).status).toBe(400)
      expect((yield* del("dream")).status).toBe(400)
      expect((yield* del("nobody")).status).toBe(404)
      expect((yield* del("researcher")).status).toBe(200)
      expect((yield* del("researcher")).status).toBe(404)
    }),
  )
})
