// ENG-12 / RULE-02: the platform gateway is part of the shipped product configuration, so a packaged
// install has its address without anything being written into a user's config file. The key and the
// models are the user's: the client stores the key in the engine's auth store and the models in the
// user's own configuration, and until both are there the gateway is simply not offered.
import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Cause, Effect, Exit, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { Product } from "../../src/config/product"
import { ProviderV2 } from "@opencode-ai/core/provider"
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

const BASE_URL = "https://openrouter.ai/api/v1"
const API_KEY = "product-test-key"
const MODEL_ID = "platform-model-1"
const GATEWAY = ProviderV2.ID.make(Product.GATEWAY_PROVIDER)

// Everything that decides which product configuration is read and how the gateway resolves. A test
// states all of it, so nothing leaks in from the suite's preload or from another test.
const ENV = ["OPENCODE_CONFIG_DIR", "HARNESS_PRODUCT_DIR", "OPENCODE_CONFIG_CONTENT", "OPENCODE_AUTH_CONTENT"]

const withEnv = <A, E, R>(vars: Record<string, string | undefined>, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous: Record<string, string | undefined> = {}
      for (const key of ENV) previous[key] = process.env[key]
      for (const key of ENV) delete process.env[key]
      for (const [key, value] of Object.entries(vars)) {
        if (value !== undefined) process.env[key] = value
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

// What the client writes when the user configures the gateway: the key into the auth store, the
// models into the user's configuration. The address is never written; it stays in the shipped file.
const storedKey = JSON.stringify({ [Product.GATEWAY_PROVIDER]: { type: "api", key: API_KEY } })
const userModels = JSON.stringify({
  provider: {
    [Product.GATEWAY_PROVIDER]: {
      models: { [MODEL_ID]: { name: MODEL_ID } },
    },
  },
})

const failure = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(self)
    expect(Exit.isFailure(exit)).toBe(true)
    return Exit.isFailure(exit) ? Cause.pretty(exit.cause) : ""
  })

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("the shipped configuration carries the gateway's address and nothing of the user's", () =>
  withEnv(
    {},
    Effect.gen(function* () {
      const config = yield* Config.use.get()
      const provider = config.provider?.[Product.GATEWAY_PROVIDER]
      expect(provider?.npm).toBe("@ai-sdk/openai-compatible")
      expect(provider?.options?.["baseURL"]).toBe(BASE_URL)
      // The platform gateway answers only complete responses (no stream), so the product declares it.
      expect(provider?.options?.["streaming"]).toBe(false)
      expect(provider?.options?.["apiKey"]).toBeUndefined()
      expect(provider?.models ?? {}).toEqual({})
      expect(config.model).toBeUndefined()
      expect(config.enabled_providers).toEqual([Product.GATEWAY_PROVIDER])

      // No key and no model: the gateway is not offered, and nothing fails.
      const providers = yield* Provider.use.list()
      expect(Object.keys(providers)).toEqual([])
    }),
  ),
)

it.instance("a stored key and a model in the user's configuration make the gateway available", () =>
  withEnv(
    { OPENCODE_AUTH_CONTENT: storedKey, OPENCODE_CONFIG_CONTENT: userModels },
    Effect.gen(function* () {
      const providers = yield* Provider.use.list()
      expect(Object.keys(providers)).toEqual([Product.GATEWAY_PROVIDER])
      const provider = providers[GATEWAY]
      expect(provider.options["baseURL"]).toBe(BASE_URL)
      expect(provider.options["streaming"]).toBe(false)
      expect(provider.key).toBe(API_KEY)
      expect(Object.keys(provider.models)).toEqual([MODEL_ID])
    }),
  ),
)

it.instance("a model without a key: the gateway is not offered", () =>
  withEnv(
    { OPENCODE_CONFIG_CONTENT: userModels },
    Effect.gen(function* () {
      const providers = yield* Provider.use.list()
      expect(Object.keys(providers)).toEqual([])
    }),
  ),
)

it.instance("a key without a model: the gateway is not offered", () =>
  withEnv(
    { OPENCODE_AUTH_CONTENT: storedKey },
    Effect.gen(function* () {
      const providers = yield* Provider.use.list()
      expect(Object.keys(providers)).toEqual([])
    }),
  ),
)

it.instance("a product configuration that lost the address is refused by name", () =>
  withEnv(
    {
      OPENCODE_AUTH_CONTENT: storedKey,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        provider: {
          [Product.GATEWAY_PROVIDER]: {
            options: { baseURL: "" },
            models: { [MODEL_ID]: { name: MODEL_ID } },
          },
        },
      }),
    },
    Effect.gen(function* () {
      const message = yield* failure(Provider.use.list())
      expect(message).toContain(
        "The model gateway is not configured: baseURL is missing from the product configuration.",
      )
    }),
  ),
)

it.instance("a second definition of the same provider merges onto the product's instead of colliding", () =>
  withEnv(
    {
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        provider: {
          [Product.GATEWAY_PROVIDER]: {
            npm: "@ai-sdk/openai-compatible",
            options: { baseURL: "http://127.0.0.1:8797/v1", apiKey: "local-key" },
            models: { "local-1": { name: "local-1", limit: { context: 128000, output: 8000 } } },
          },
        },
        model: `${Product.GATEWAY_PROVIDER}/local-1`,
        enabled_providers: [Product.GATEWAY_PROVIDER],
      }),
    },
    Effect.gen(function* () {
      // The shipped configuration is the base, so a host that names its own gateway wins outright;
      // this is the shape the harness end-to-end run layers on.
      const providers = yield* Provider.use.list()
      const provider = providers[GATEWAY]
      expect(provider?.options["baseURL"]).toBe("http://127.0.0.1:8797/v1")
      expect(provider?.options["apiKey"]).toBe("local-key")
      expect(Object.keys(provider?.models ?? {})).toEqual(["local-1"])
    }),
  ),
)
