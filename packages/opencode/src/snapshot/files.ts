// File-level checkpoints (ENG-24). The engine records the previous content of every file its own
// file tools write, per checkpoint, and undo, revert and the change list are rebuilt from those
// records. Nothing scans the working directory, so the cost follows the edits and not the size of
// the directory. A file changed outside the engine's write path -- a shell command, an MCP server,
// a download -- is not recorded and is not undone.
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { formatPatch, structuredPatch } from "diff"
import type { FileDiff, Patch } from "."

type Preimage = string | null

type Checkpoint = {
  id: string
  files: Map<string, Preimage>
}

export interface Input {
  worktree: string
  store: string
  writeFile: (file: string, content: string | Uint8Array) => Effect.Effect<void, Error>
  removeFile: (file: string) => Effect.Effect<void, Error>
}

const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const ID_PREFIX = "fc-"

const isMissing = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"

// A stored checkpoint is data written by an earlier run; anything malformed reads as empty.
function recorded(value: unknown): Record<string, Preimage> {
  if (typeof value !== "object" || value === null || !("files" in value)) return {}
  const files = value.files
  if (typeof files !== "object" || files === null) return {}
  const result: Record<string, Preimage> = {}
  for (const [file, content] of Object.entries(files)) {
    if (typeof content === "string" || content === null) result[file] = content
  }
  return result
}

function count(hunks: ReturnType<typeof structuredPatch>["hunks"]) {
  let additions = 0
  let deletions = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) additions += 1
      else if (line.startsWith("-")) deletions += 1
    }
  }
  return { additions, deletions }
}

export function make(input: Input) {
  const checkpoints = new Map<string, Checkpoint>()
  let current: Checkpoint | undefined
  let loaded = false
  let sequence = 0

  const relative = (file: string) =>
    path.relative(input.worktree, path.resolve(input.worktree, file)).replaceAll("\\", "/")
  const absolute = (file: string) => path.join(input.worktree, file)
  const location = (id: string) => path.join(input.store, `${id}.json`)

  // Store I/O failing is a defect: a checkpoint that cannot be recorded must not pass silently.
  const readCurrent = (file: string) =>
    Effect.promise(() =>
      fs.readFile(absolute(file), "utf8").catch((error) => (isMissing(error) ? null : Promise.reject(error))),
    )

  const persist = (checkpoint: Checkpoint) =>
    Effect.promise(async () => {
      await fs.mkdir(input.store, { recursive: true })
      await fs.writeFile(location(checkpoint.id), JSON.stringify({ files: Object.fromEntries(checkpoint.files) }))
    })

  const load = Effect.fnUntraced(function* () {
    if (loaded) return
    loaded = true
    const entries = yield* Effect.promise(() => fs.readdir(input.store).catch(() => [] as string[]))
    for (const entry of entries) {
      if (!entry.startsWith(ID_PREFIX) || !entry.endsWith(".json")) continue
      const id = entry.slice(0, -".json".length)
      const parsed: unknown = yield* Effect.promise(() =>
        fs
          .readFile(path.join(input.store, entry), "utf8")
          .then((text) => JSON.parse(text))
          .catch(() => undefined),
      )
      checkpoints.set(id, { id, files: new Map(Object.entries(recorded(parsed))) })
    }
  })

  const ordered = () => [...checkpoints.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const since = (hash: string) => ordered().filter((item) => item.id >= hash)
  const between = (from: string, to: string) => ordered().filter((item) => item.id >= from && item.id < to)
  const union = (list: Checkpoint[]) => [...new Set(list.flatMap((item) => [...item.files.keys()]))].sort()
  const earliest = (list: Checkpoint[], file: string): Preimage | undefined => {
    for (const item of list) if (item.files.has(file)) return item.files.get(file)
    return undefined
  }

  const apply = Effect.fnUntraced(function* (file: string, content: Preimage) {
    if (content === null) {
      yield* input.removeFile(absolute(file)).pipe(Effect.catch(() => Effect.void))
      return
    }
    yield* input.writeFile(absolute(file), content).pipe(Effect.orDie)
  })

  const capture = Effect.fnUntraced(function* (file: string) {
    if (!current) return
    const key = relative(file)
    if (current.files.has(key)) return
    current.files.set(key, yield* readCurrent(key))
    yield* persist(current)
  })

  const track = Effect.fnUntraced(function* () {
    yield* load()
    sequence = (sequence + 1) % 1000
    const id = `${ID_PREFIX}${String(Date.now()).padStart(15, "0")}${String(sequence).padStart(3, "0")}`
    const checkpoint: Checkpoint = { id, files: new Map() }
    checkpoints.set(id, checkpoint)
    current = checkpoint
    yield* persist(checkpoint)
    return id
  })

  const patch = Effect.fnUntraced(function* (hash: string) {
    yield* load()
    const result: Patch = { hash, files: union(since(hash)) }
    return result
  })

  const restore = Effect.fnUntraced(function* (hash: string) {
    yield* load()
    const list = since(hash)
    for (const file of union(list)) {
      const content = earliest(list, file)
      if (content === undefined) continue
      yield* apply(file, content)
    }
  })

  const revert = Effect.fnUntraced(function* (patches: Patch[]) {
    yield* load()
    const sorted = [...patches].sort((a, b) => (a.hash < b.hash ? 1 : a.hash > b.hash ? -1 : 0))
    for (const item of sorted) {
      const checkpoint = checkpoints.get(item.hash)
      if (!checkpoint) continue
      for (const file of item.files) {
        if (!checkpoint.files.has(file)) continue
        yield* apply(file, checkpoint.files.get(file) ?? null)
      }
    }
  })

  const unified = (file: string, before: string, after: string) =>
    formatPatch(structuredPatch(file, file, before, after))

  const diff = Effect.fnUntraced(function* (hash: string) {
    yield* load()
    const list = since(hash)
    const parts: string[] = []
    for (const file of union(list)) {
      const before = earliest(list, file) ?? ""
      const after = (yield* readCurrent(file)) ?? ""
      if (before === after) continue
      parts.push(unified(file, before, after))
    }
    return parts.join("\n")
  })

  const diffFull = Effect.fnUntraced(function* (from: string, to: string) {
    yield* load()
    const inside = between(from, to)
    const later = since(to)
    const result: FileDiff[] = []
    for (const file of union(inside)) {
      const before = earliest(inside, file) ?? null
      const recorded = earliest(later, file)
      const after = recorded === undefined ? yield* readCurrent(file) : recorded
      if (before === after) continue
      if (before === null && after === null) continue
      const text = structuredPatch(file, file, before ?? "", after ?? "")
      result.push({
        file,
        patch: formatPatch(text),
        status: before === null ? "added" : after === null ? "deleted" : "modified",
        ...count(text.hunks),
      })
    }
    return result
  })

  const cleanup = Effect.fnUntraced(function* () {
    yield* load()
    const cutoff = Date.now() - PRUNE_AFTER_MS
    for (const item of ordered()) {
      const stamp = Number(item.id.slice(ID_PREFIX.length, ID_PREFIX.length + 15))
      if (!Number.isFinite(stamp) || stamp >= cutoff) continue
      if (item === current) continue
      checkpoints.delete(item.id)
      yield* Effect.promise(() => fs.rm(location(item.id), { force: true }))
    }
  })

  const write = Effect.fnUntraced(function* (file: string, content: string | Uint8Array) {
    yield* capture(file)
    yield* input.writeFile(file, content)
  })

  const remove = Effect.fnUntraced(function* (file: string) {
    yield* capture(file)
    yield* input.removeFile(file)
  })

  return { cleanup, track, patch, restore, revert, diff, diffFull, write, remove }
}

export * as SnapshotFiles from "./files"
