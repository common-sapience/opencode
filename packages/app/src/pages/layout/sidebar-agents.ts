// The agent-grouped sidebar's data shape (UI-02). Pure so the grouping can be asserted without
// rendering: the blank agent first (D-03), and every session under exactly one agent (D-01).

export const BLANK_AGENT = "default"

type AgentLike = { name: string; mode: string; hidden?: boolean }
type SessionLike = { agent?: string }

// The agents a user can pick: primary definitions that are not hidden, the blank agent first, the
// rest by name.
export function userAgents<T extends AgentLike>(agents: readonly T[]): T[] {
  const visible = agents.filter((agent) => agent.mode !== "subagent" && !agent.hidden)
  const blank = visible.filter((agent) => agent.name === BLANK_AGENT)
  const rest = visible.filter((agent) => agent.name !== BLANK_AGENT).sort((a, b) => a.name.localeCompare(b.name))
  return [...blank, ...rest]
}

// A session whose agent is unknown, gone or unset is shown under the blank agent, which is also
// what the engine runs it under (ENG-20).
export function groupSessionsByAgent<T extends SessionLike>(
  agents: readonly AgentLike[],
  sessions: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>(agents.map((agent) => [agent.name, []]))
  for (const session of sessions) {
    const key = session.agent && groups.has(session.agent) ? session.agent : BLANK_AGENT
    const list = groups.get(key)
    if (list) list.push(session)
    else groups.set(key, [session])
  }
  return groups
}
