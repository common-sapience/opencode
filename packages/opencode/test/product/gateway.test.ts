// ENG-12 / RULE-02 / HOST-09: the platform gateway is part of the shipped product configuration, so
// a packaged install has a model gateway without anything being written into a user's config file.
// Its address, key and model id are the one part of that configuration with no default: the host
// injects them when it starts the engine, and a missing one is refused by name rather than sent to
// the wire as an empty string.
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

const BASE_URL = "https://gateway.example/v1"
const API_KEY = "product-test-key"
const MODEL_ID = "platform-model-1"
const GATEWAY = ProviderV2.ID.make(Product.GATEWAY_PROVIDER)

// Everything that decides which product configuration is read and how the gateway resolves. A test
// states all of it, so nothing leaks in from the suite's preload or from another test.
const ENV = [
  "OPENCODE_CONFIG_DIR",
  "HARNESS_PRODUCT_DIR",
  "OPENCODE_CONFIG_CONTENT",
  Product.GATEWAY_BASE_URL,
  Product.GATEWAY_API_KEY,
  Product.GATEWAY_MODEL_ID,
]

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

const configured = {
  [Product.GATEWAY_BASE_URL]: BASE_URL,
  [Product.GATEWAY_API_KEY]: API_KEY,
  [Product.GATEWAY_MODEL_ID]: MODEL_ID,
}

const failure = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(self)
    expect(Exit.isFailure(exit)).toBe(true)
    return Exit.isFailure(exit) ? Cause.pretty(exit.cause) : ""
  })

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("the shipped configuration is the gateway: address, key and model come from the environment", () =>
  withEnv(
    configured,
    Effect.gen(function* () {
      const config = yield* Config.use.get()
      const provider = config.provider?.[Product.GATEWAY_PROVIDER]
      expect(provider?.npm).toBe("@ai-sdk/openai-compatible")
      expect(provider?.options?.["baseURL"]).toBe(BASE_URL)
      expect(provider?.options?.["apiKey"]).toBe(API_KEY)
      // The platform gateway answers only complete responses (no stream), so the product declares it.
      expect(provider?.options?.["streaming"]).toBe(false)

      // The model id is a key, and `{env:...}` is substituted in the configuration text before it is
      // parsed, so a key carries a variable the same way a value does. That is what keeps the model
      // out of the shipped file: there is no generic entry a model id could be matched against.
      expect(Object.keys(provider?.models ?? {})).toEqual([MODEL_ID])
      expect(config.model).toBe(`${Product.GATEWAY_PROVIDER}/${MODEL_ID}`)
      expect(config.enabled_providers).toEqual([Product.GATEWAY_PROVIDER])

      const providers = yield* Provider.use.list()
      expect(Object.keys(providers)).toEqual([Product.GATEWAY_PROVIDER])
      expect(Object.keys(providers[GATEWAY].models)).toEqual([MODEL_ID])
    }),
  ),
)

it.instance("nothing set: the gateway is refused, and the message names all three variables", () =>
  withEnv(
    {},
    Effect.gen(function* () {
      const config = yield* Config.use.get()
      // A model whose id resolved to nothing is not a model, so it is dropped rather than offered.
      expect(config.provider?.[Product.GATEWAY_PROVIDER]?.models).toEqual({})

      const message = yield* failure(Provider.use.list())
      // Not an empty model list and not a 401 from the gateway: the reason is the environment, and
      // every variable that has to be set is named in one sentence.
      expect(message).toContain(
        "The model gateway is not configured: MODEL_API_BASE_URL, MODEL_API_KEY, MODEL_ID are not set in the engine's environment.",
      )
    }),
  ),
)

it.instance("one variable missing: only that one is named", () =>
  withEnv(
    { ...configured, [Product.GATEWAY_API_KEY]: undefined },
    Effect.gen(function* () {
      const message = yield* failure(Provider.use.list())
      expect(message).toContain(
        "The model gateway is not configured: MODEL_API_KEY is not set in the engine's environment.",
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
      // The shipped configuration is the base, so a host that names its own gateway wins outright
      // even with none of the variables set; this is the shape the harness end-to-end run layers on.
      const providers = yield* Provider.use.list()
      const provider = providers[GATEWAY]
      expect(provider?.options["baseURL"]).toBe("http://127.0.0.1:8797/v1")
      expect(provider?.options["apiKey"]).toBe("local-key")
      expect(Object.keys(provider?.models ?? {})).toEqual(["local-1"])
    }),
  ),
)
