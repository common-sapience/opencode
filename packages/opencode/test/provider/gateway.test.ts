import { describe, expect, test } from "bun:test"
import { Gateway } from "../../src/provider/gateway"

describe("Gateway.parse", () => {
  test("reads the OpenAI-compatible listing and falls back where the gateway is silent", () => {
    const models = Gateway.parse({
      data: [
        { id: "a", name: "A", context_length: 32000, max_completion_tokens: 4000, supported_parameters: ["tools"] },
        { id: "b", architecture: { input_modalities: ["text", "image"] } },
        { id: "" },
        { name: "no id" },
        "junk",
      ],
    })
    expect(Object.keys(models)).toEqual(["a", "b"])
    expect(models["a"].limit).toEqual({ context: 32000, output: 4000 })
    expect(models["a"].tool_call).toBe(true)
    expect(models["a"].reasoning).toBe(false)
    expect(models["b"].name).toBe("b")
    expect(models["b"].limit).toEqual({ context: 128000, output: 8192 })
    expect(models["b"].attachment).toBe(true)
    expect(models["b"].tool_call).toBe(true)
  })

  test("anything that is not a listing yields nothing", () => {
    expect(Gateway.parse(null)).toEqual({})
    expect(Gateway.parse({ data: "nope" })).toEqual({})
    expect(Gateway.parse([])).toEqual({})
  })

  test("the models URL is the base URL plus /models", () => {
    expect(Gateway.modelsURL("https://gw.example/v1/")).toBe("https://gw.example/v1/models")
  })
})
