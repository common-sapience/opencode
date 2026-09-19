// The agent-grouped sidebar's data shape (UI-02). Pure so the grouping can be asserted without
// rendering: the blank agent first (D-03), and every session under exactly one agent (D-01).

export const BLANK_AGENT = "default"

type AgentLike = { name: string; mode: string; hidden?: boolean; description?: string }
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

// The groups the sidebar draws. The agent list and the session list load separately, so a session
// whose group is missing -- the list is late, failed, or has no blank agent -- still gets the blank
// group rather than disappearing.
export function sidebarAgents<T extends AgentLike>(agents: readonly T[], sessions: readonly SessionLike[]): AgentLike[] {
  const listed = userAgents(agents)
  if (listed.some((agent) => agent.name === BLANK_AGENT)) return listed
  const names = new Set(listed.map((agent) => agent.name))
  if (sessions.every((session) => session.agent !== undefined && names.has(session.agent))) return listed
  return [{ name: BLANK_AGENT, mode: "primary" }, ...listed]
}
