import { describe, expect, test } from "bun:test"
import { ProviderPlugins } from "@opencode-ai/core/plugin/provider"

// ENG-12 / RULE-02: the platform gateway speaks the openai-compatible API and is the only
// provider the product ships. A new entry here would reintroduce a second provider path.
describe("provider plugin lock", () => {
  test("only the openai-compatible adapter is registered", () => {
    expect(ProviderPlugins.map((plugin) => plugin.id)).toEqual(["openai-compatible"])
  })

  test("no plugin resolves an adapter from npm at runtime", () => {
    expect(ProviderPlugins.some((plugin) => plugin.id === "dynamic-provider")).toBe(false)
  })
})
