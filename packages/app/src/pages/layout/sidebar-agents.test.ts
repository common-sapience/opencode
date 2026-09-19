// The agent-grouped sidebar (UI-02, D-01, D-03): the blank agent first, hidden and subagent
// definitions absent, every session under exactly one agent and orphans under the blank agent.
import { describe, expect, test } from "bun:test"
import { groupSessionsByAgent, sidebarAgents, userAgents } from "./sidebar-agents"

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

// The agent list and the session list load separately, and a session must never be hidden because
// the agent list is late, failed or lacks the blank agent.
describe("sidebarAgents", () => {
  test("sessions stay visible under the blank agent while the agent list is empty", () => {
    const list = sidebarAgents([], [session("a"), session("b", "writer")])
    expect(list.map((item) => item.name)).toEqual(["default"])
    expect(groupSessionsByAgent(list, [session("a"), session("b", "writer")]).get("default")?.length).toBe(2)
  })

  test("the blank group is added first when the list lacks it and an orphan exists", () => {
    const list = sidebarAgents([agent("writer")], [session("a", "gone")])
    expect(list.map((item) => item.name)).toEqual(["default", "writer"])
  })

  test("nothing is added when the blank agent is listed or every session has a listed agent", () => {
    expect(sidebarAgents([agent("default"), agent("writer")], [session("a")]).map((item) => item.name)).toEqual([
      "default",
      "writer",
    ])
    expect(sidebarAgents([agent("writer")], [session("a", "writer")]).map((item) => item.name)).toEqual(["writer"])
    expect(sidebarAgents([], []).map((item) => item.name)).toEqual([])
  })
})
