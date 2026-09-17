// User-created agent definitions (ENG-21). An agent is a markdown definition file the engine already
// knows how to load; this module is the one write path for the user's own, in the global
// configuration directory. The product's shipped definitions live elsewhere and are never touched.
import fs from "fs/promises"
import path from "path"
import matter from "gray-matter"
import { Effect, Schema } from "effect"
import { Global } from "@opencode-ai/core/global"
import { agentSkillsDir } from "@/skill"

// The engine's own definitions plus the product's consolidation profile. A user definition may not
// take one of these names: it would replace or shadow the built-in silently.
export const RESERVED = [
  "default",
  "build",
  "plan",
  "general",
  "explore",
  "compaction",
  "title",
  "summary",
  "dream",
] as const

const NAME_MAX_LENGTH = 64

export const CreateInput = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
}).annotate({ identifier: "AgentDefinitionCreateInput" })
export type CreateInput = Schema.Schema.Type<typeof CreateInput>

export const Created = Schema.Struct({
  name: Schema.String,
}).annotate({ identifier: "AgentDefinitionCreated" })

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()(
  "AgentDefinition.InvalidError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class ExistsError extends Schema.TaggedErrorClass<ExistsError>()(
  "AgentDefinition.ExistsError",
  { message: Schema.String, name: Schema.String },
  { httpApiStatus: 409 },
) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  "AgentDefinition.NotFoundError",
  { message: Schema.String, name: Schema.String },
  { httpApiStatus: 404 },
) {}

export function directory() {
  return path.join(Global.Path.config, "agent")
}

export function file(name: string) {
  return path.join(directory(), `${name}.md`)
}

function validName(raw: string): string | undefined {
  const name = raw.trim()
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) return undefined
  if (name.startsWith(".") || /[\\/\0]/.test(name)) return undefined
  if ((RESERVED as readonly string[]).includes(name)) return undefined
  return name
}

const invalidName = (raw: string) =>
  new InvalidError({
    message: `Invalid agent name: "${raw}". Names are 1 to ${NAME_MAX_LENGTH} characters, no path separators, and not a built-in agent.`,
  })

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined

export const create = Effect.fn("AgentDefinition.create")(function* (input: CreateInput) {
  const name = validName(input.name)
  if (!name) return yield* Effect.fail(invalidName(input.name))
  const description = input.description.trim()
  if (description.length === 0)
    return yield* Effect.fail(new InvalidError({ message: "An agent needs a description." }))

  // The description is a role, not a replacement system prompt: the engine keeps the base prompt
  // and prepends the agent's own name to the role (D-02).
  const content = matter.stringify(`${description}\n`, {
    description: description.split("\n")[0],
    mode: "primary",
    inherit_base_prompt: true,
  })
  const target = file(name)
  yield* Effect.promise(() => fs.mkdir(directory(), { recursive: true }))
  // Exclusive create, so two racing requests cannot both claim the name.
  yield* Effect.tryPromise({
    try: () => fs.writeFile(target, content, { flag: "wx" }),
    catch: (error) =>
      errorCode(error) === "EEXIST"
        ? new ExistsError({ message: `An agent named "${name}" already exists.`, name })
        : new InvalidError({ message: `Could not write the agent definition: ${String(error)}` }),
  })
  yield* Effect.logInfo("agent definition created", { name, file: target })
  return { name }
})

export const remove = Effect.fn("AgentDefinition.remove")(function* (raw: string) {
  const name = validName(raw)
  if (!name) return yield* Effect.fail(invalidName(raw))
  const target = file(name)
  yield* Effect.tryPromise({
    try: () => fs.unlink(target),
    catch: (error) =>
      errorCode(error) === "ENOENT"
        ? new NotFoundError({ message: `No user-created agent named "${name}".`, name })
        : new InvalidError({ message: `Could not delete the agent definition: ${String(error)}` }),
  })
  yield* Effect.promise(() => fs.rm(agentSkillsDir(name), { recursive: true, force: true }))
  yield* Effect.logInfo("agent definition removed", { name, file: target })
  return true as const
})

export * as AgentDefinition from "./definition"
