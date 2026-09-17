import { describe, expect, test } from "bun:test"
import { resolveDefaultModel } from "./provider-catalog"

describe("resolveDefaultModel", () => {
  test("splits the configured model at the first separator only", () => {
    expect(resolveDefaultModel(undefined, "platform/~openai/gpt-astra-latest")).toEqual({
      providerID: "platform",
      modelID: "~openai/gpt-astra-latest",
    })
  })

  test("rejects a configured model without a provider or a model", () => {
    expect(resolveDefaultModel(undefined, "platform/")).toBeUndefined()
    expect(resolveDefaultModel(undefined, "/gpt")).toBeUndefined()
    expect(resolveDefaultModel(undefined, "")).toBeUndefined()
  })

  test("prefers the catalog's default when the server gives one", () => {
    expect(resolveDefaultModel({ providerID: "platform", modelID: "a" }, "platform/b")).toEqual({
      providerID: "platform",
      modelID: "a",
    })
  })
})
