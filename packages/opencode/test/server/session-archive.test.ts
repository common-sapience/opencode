// ENG-20: archive and unarchive. The instance session list defaults to the unarchived sessions,
// `archived=true` lists only the archived ones, and PATCH clears the archive timestamp so an
// archived session can be brought back and talked to again.
import { afterEach, describe, expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Config, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http"
import { layerWebSocketConstructorGlobal } from "effect/unstable/socket/Socket"
import { Workspace } from "../../src/control-plane/workspace"
import { InstanceBootstrap as InstanceBootstrapService } from "../../src/project/bootstrap-service"
import { InstanceStore } from "../../src/project/instance-store"
import { Project } from "../../src/project/project"
import { SessionPaths } from "../../src/server/routes/instance/httpapi/groups/session"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { Session } from "@/session/session"
import { SessionID } from "../../src/session/schema"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const noopBootstrapLayer = Layer.succeed(
  InstanceBootstrapService.Service,
  InstanceBootstrapService.Service.of({ run: Effect.void }),
)
const appLayer = AppNodeBuilder.build(
  LayerNode.group([InstanceStore.node, Project.node, Session.node, Workspace.node, Database.node, Ripgrep.node]),
  [[InstanceStore.bootstrapNode, noopBootstrapLayer]],
)
const servedRoutes: Layer.Layer<never, Config.ConfigError, HttpServer.HttpServer> = HttpRouter.serve(
  HttpApiApp.routes,
  { disableListenLog: true, disableLogger: true },
)
const httpApiLayer = servedRoutes.pipe(
  Layer.provide(layerWebSocketConstructorGlobal),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
)
const it = testEffect(Layer.mergeAll(appLayer, httpApiLayer))

function pathFor(path: string, params: Record<string, string>) {
  return Object.entries(params).reduce((result, [key, value]) => result.replace(`:${key}`, value), path)
}

function request(path: string, init?: RequestInit) {
  const url = new URL(path, "http://localhost")
  return HttpClientRequest.fromWeb(new Request(url, init)).pipe(
    HttpClientRequest.setUrl(url.pathname),
    HttpClient.execute,
  )
}

function json<T>(response: HttpClientResponse.HttpClientResponse) {
  if (response.status !== 200) return response.text.pipe(Effect.flatMap((text) => Effect.die(new Error(text))))
  return response.json.pipe(Effect.map((value) => value as T))
}

function requestJson<T>(path: string, init?: RequestInit) {
  return request(path, init).pipe(Effect.flatMap(json<T>))
}

const archive = (sessionID: string, time: number) =>
  Session.Service.use((session) => session.setArchived({ sessionID: SessionID.make(sessionID), time }))

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("session archive", () => {
  it.instance(
    "ENG-20: the session list excludes archived sessions and archived=true lists only those",
    () =>
      Effect.gen(function* () {
        const open = yield* Session.use.create({ title: "open" })
        const stored = yield* Session.use.create({ title: "stored" })
        yield* archive(stored.id, Date.now())

        const listed = (yield* Session.use.list()).map((item) => item.id)
        expect(listed).toContain(open.id)
        expect(listed).not.toContain(stored.id)

        const archived = (yield* Session.use.list({ archived: true })).map((item) => item.id)
        expect(archived).toEqual([stored.id])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "ENG-20: the session list route filters by archived state",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory }
        const open = yield* Session.use.create({ title: "open" })
        const stored = yield* Session.use.create({ title: "stored" })
        yield* archive(stored.id, Date.now())

        const defaults = yield* requestJson<Session.Info[]>(SessionPaths.list, { headers })
        expect(defaults.map((item) => item.id)).toContain(open.id)
        expect(defaults.map((item) => item.id)).not.toContain(stored.id)

        const archived = yield* requestJson<Session.Info[]>(`${SessionPaths.list}?archived=true`, { headers })
        expect(archived.map((item) => item.id)).toEqual([stored.id])

        const explicitlyNot = yield* requestJson<Session.Info[]>(`${SessionPaths.list}?archived=false`, { headers })
        expect(explicitlyNot.map((item) => item.id)).not.toContain(stored.id)

        const invalid = yield* request(`${SessionPaths.list}?archived=maybe`, { headers })
        expect(invalid.status).toBe(400)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "ENG-20: patching archived to null unarchives the session",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const created = yield* Session.use.create({ title: "round trip" })
        const update = pathFor(SessionPaths.update, { sessionID: created.id })

        const archived = yield* requestJson<Session.Info>(update, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ time: { archived: 1700000000000 } }),
        })
        expect(archived.time.archived).toBe(1700000000000)
        expect(
          (yield* requestJson<Session.Info[]>(SessionPaths.list, { headers })).map((item) => item.id),
        ).not.toContain(created.id)

        const restored = yield* requestJson<Session.Info>(update, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ time: { archived: null } }),
        })
        expect(restored.time.archived).toBeUndefined()
        expect((yield* requestJson<Session.Info[]>(SessionPaths.list, { headers })).map((item) => item.id)).toContain(
          created.id,
        )
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "ENG-20: patching another field leaves the archive timestamp alone",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const created = yield* Session.use.create({ title: "kept" })
        const update = pathFor(SessionPaths.update, { sessionID: created.id })

        yield* archive(created.id, 1700000000000)
        const renamed = yield* requestJson<Session.Info>(update, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ title: "renamed" }),
        })
        expect(renamed.title).toBe("renamed")
        expect(renamed.time.archived).toBe(1700000000000)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
