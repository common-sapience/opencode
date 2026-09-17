// The agent-grouped sidebar (UI-02, D-01, D-03): the blank agent first, hidden and subagent
// definitions absent, every session under exactly one agent and orphans under the blank agent.
import { describe, expect, test } from "bun:test"
import { groupSessionsByAgent, userAgents } from "./sidebar-agents"

const agent = (name: string, extra: { mode?: string; hidden?: boolean } = {}) => ({ name, mode: "primary", ...extra })
const session = (id: string, agent?: string) => ({ id, agent })

describe("userAgents", () => {
  test("keeps primary visible definitions with the blank agent first and the rest sorted", () => {
    const list = userAgents([
      agent("writer"),
      agent("general", { mode: "subagent" }),
      agent("dream", { hidden: true }),
      agent("default"),
      agent("Researcher"),
    ])
    expect(list.map((item) => item.name)).toEqual(["default", "Researcher", "writer"])
  })
})

describe("groupSessionsByAgent", () => {
  test("puts every session under its agent and orphans under the blank agent", () => {
    const agents = [agent("default"), agent("Researcher")]
    const groups = groupSessionsByAgent(agents, [
      session("a", "Researcher"),
      session("b"),
      session("c", "deleted-agent"),
      session("d", "default"),
    ])
    expect([...groups.keys()]).toEqual(["default", "Researcher"])
    expect(groups.get("Researcher")?.map((item) => item.id)).toEqual(["a"])
    expect(groups.get("default")?.map((item) => item.id)).toEqual(["b", "c", "d"])
  })

  test("an agent without sessions still has an empty group", () => {
    const groups = groupSessionsByAgent([agent("default"), agent("Writer")], [])
    expect(groups.get("Writer")).toEqual([])
  })
})
