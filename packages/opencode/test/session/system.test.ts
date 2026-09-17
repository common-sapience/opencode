// The leading system chunks of a request (ENG-21, D-02). A user-created agent is a role description,
// not a replacement system prompt: it inherits the provider's base prompt and is told its own name.
// Native and hand-written definitions keep the upstream semantics, where a prompt replaces the base.
import { describe, expect, test } from "bun:test"
import type { Agent } from "@/agent/agent"
import type { Provider } from "@/provider/provider"
import { SystemPrompt } from "@/session/system"

const model = {
  providerID: "anthropic",
  api: { id: "claude-sonnet-4-5" },
} as unknown as Provider.Model

const base = SystemPrompt.provider(model)

function agent(overrides: Partial<Agent.Info>): Agent.Info {
  return { name: "mark", mode: "primary", permission: [], options: {}, ...overrides } as Agent.Info
}

describe("SystemPrompt.persona", () => {
  test("an agent without a prompt gets the provider's base prompt", () => {
    expect(SystemPrompt.persona(agent({}), model)).toEqual(base)
  })

  test("a definition that does not inherit replaces the base prompt", () => {
    expect(SystemPrompt.persona(agent({ prompt: "Only do this." }), model)).toEqual(["Only do this."])
  })

  test("an inheriting definition keeps the base prompt and learns its own name", () => {
    const parts = SystemPrompt.persona(
      agent({ name: "mark", prompt: "Find sources for a claim.", inheritBasePrompt: true }),
      model,
    )
    expect(parts.slice(0, base.length)).toEqual(base)
    const identity = parts.slice(base.length).join("\n")
    expect(identity).toContain("mark")
    expect(identity).toContain("Find sources for a claim.")
  })

  test("an inheriting definition with no body still learns its own name", () => {
    const parts = SystemPrompt.persona(agent({ name: "mark", inheritBasePrompt: true }), model)
    expect(parts.slice(0, base.length)).toEqual(base)
    expect(parts.slice(base.length).join("\n")).toContain("mark")
  })
})
