import { describe, expect, test } from "bun:test"
import { ProviderTransform } from "@/provider/transform"
import { Product } from "@/config/product"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import type * as Provider from "@/provider/provider"

// The gateway answers 400 to any field it does not know (T-02). The OpenAI-compatible SDK sends an
// assistant reasoning part back as `reasoning_content`, so a second turn after a reasoning model
// would be refused; the transform drops those parts for the gateway only.
const model = (providerID: string): Provider.Model => ({
  id: ModelV2.ID.make("glm"),
  providerID: ProviderV2.ID.make(providerID),
  api: { id: "glm", url: "https://gateway.example/v1", npm: "@ai-sdk/openai-compatible" },
  name: "glm",
  capabilities: {
    temperature: true,
    reasoning: true,
    attachment: false,
    toolcall: true,
    input: { text: true, audio: false, image: false, video: false, pdf: false },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 128000, output: 8192 },
  status: "active",
  options: {},
  headers: {},
  release_date: "",
})

const history = () =>
  [
    { role: "user", content: "hi" },
    {
      role: "assistant",
      content: [
        { type: "reasoning", text: "a greeting, no tools needed" },
        { type: "text", text: "Hi! How can I help?" },
      ],
    },
    { role: "user", content: "what is your name" },
  ] as any[]

describe("gateway request shape", () => {
  test("earlier assistant reasoning is not sent back to the gateway", () => {
    const result = ProviderTransform.message(history(), model(Product.GATEWAY_PROVIDER), {})
    const assistant = result[1]
    expect(assistant.role).toBe("assistant")
    expect(assistant.content).toEqual([{ type: "text", text: "Hi! How can I help?" }])
    expect(assistant.providerOptions).toBeUndefined()
  })

  test("other providers keep their reasoning parts", () => {
    const result = ProviderTransform.message(history(), model("other"), {})
    expect((result[1].content as any[]).some((part) => part.type === "reasoning")).toBe(true)
  })
})
