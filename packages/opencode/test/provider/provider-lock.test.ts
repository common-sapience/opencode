import { describe, expect, test } from "bun:test"
import { isAllowedProviderNpm, PROVIDER_NPM_ALLOWLIST } from "@/provider/provider"

// ENG-12 / RULE-02: the lock lives in source, not only in configuration. A config or plugin may
// still name another provider, but no adapter resolves for it, so none of its models survive.
describe("provider npm allowlist", () => {
  test("the openai-compatible adapter is the only entry", () => {
    expect([...PROVIDER_NPM_ALLOWLIST]).toEqual(["@ai-sdk/openai-compatible"])
  })

  test("the openai-compatible adapter is allowed", () => {
    expect(isAllowedProviderNpm("@ai-sdk/openai-compatible")).toBe(true)
  })

  test.each([
    "@ai-sdk/anthropic",
    "@ai-sdk/openai",
    "@ai-sdk/google",
    "@ai-sdk/amazon-bedrock",
    "@ai-sdk/azure",
    "@ai-sdk/xai",
    "@openrouter/ai-sdk-provider",
    "gitlab-ai-provider",
    "venice-ai-sdk-provider",
    "ai-gateway-provider",
  ])("%s is rejected", (npm) => {
    expect(isAllowedProviderNpm(npm)).toBe(false)
  })

  test("an arbitrary package name cannot be smuggled in", () => {
    expect(isAllowedProviderNpm("some-other-provider")).toBe(false)
    expect(isAllowedProviderNpm("file:///tmp/provider.js")).toBe(false)
    // Prototype keys must not count as registered adapters.
    expect(isAllowedProviderNpm("constructor")).toBe(false)
    expect(isAllowedProviderNpm("__proto__")).toBe(false)
  })
})
