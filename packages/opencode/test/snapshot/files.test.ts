// File-level checkpoints (ENG-24): the engine records the previous content of every file its own
// write path touches, per checkpoint, and rebuilds undo, revert and the change list from those
// records. A file changed outside that path is not recorded.
import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import fs from "fs/promises"
import path from "path"
import { Effect, Layer } from "effect"
import { Config } from "../../src/config/config"
import { Snapshot } from "../../src/snapshot"
import { disposeAllInstances, TestInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(LayerNode.compile(LayerNode.group([Snapshot.node, FSUtil.node, Config.node])), testInstanceStoreLayer),
)

afterEach(async () => {
  await disposeAllInstances()
})

const read = (file: string) => Effect.promise(() => fs.readFile(file, "utf8").catch(() => undefined))

// The instance directory carries the product's choice before any configuration is read.
const setup = Effect.fn("FilesTest.setup")(function* () {
  const instance = yield* TestInstance
  const dir = instance.directory
  yield* Effect.promise(() => fs.writeFile(path.join(dir, "opencode.json"), JSON.stringify({ snapshot: "files" })))
  yield* Effect.promise(() => fs.writeFile(path.join(dir, "a.txt"), "a1\n"))
  yield* Effect.promise(() => fs.writeFile(path.join(dir, "b.txt"), "b1\n"))
  const snapshot = yield* Snapshot.Service
  return { dir, snapshot, a: path.join(dir, "a.txt"), b: path.join(dir, "b.txt"), c: path.join(dir, "c.txt") }
})

it.instance("ENG-24: a checkpoint lists the files the engine wrote after it and diffs them", () =>
  Effect.gen(function* () {
    const t = yield* setup()
    const first = yield* t.snapshot.track()
    expect(first).toBeTruthy()
    yield* t.snapshot.write(t.a, "a2\n")
    yield* t.snapshot.write(t.c, "c1\n")
    yield* t.snapshot.write(t.a, "a3\n")

    const patch = yield* t.snapshot.patch(first!)
    expect(patch.files).toEqual(["a.txt", "c.txt"])

    const diff = yield* t.snapshot.diff(first!)
    expect(diff).toContain("-a1")
    expect(diff).toContain("+a3")
    expect(diff).toContain("+c1")
    expect(diff).not.toContain("b.txt")
  }),
)

it.instance("ENG-24: restore brings every recorded file back to the checkpoint", () =>
  Effect.gen(function* () {
    const t = yield* setup()
    const first = yield* t.snapshot.track()
    yield* t.snapshot.write(t.a, "a2\n")
    yield* t.snapshot.write(t.c, "c1\n")
    const second = yield* t.snapshot.track()
    yield* t.snapshot.write(t.a, "a3\n")
    yield* t.snapshot.remove(t.b)

    yield* t.snapshot.restore(second!)
    expect(yield* read(t.a)).toBe("a2\n")
    expect(yield* read(t.b)).toBe("b1\n")
    expect(yield* read(t.c)).toBe("c1\n")

    yield* t.snapshot.restore(first!)
    expect(yield* read(t.a)).toBe("a1\n")
    expect(yield* read(t.c)).toBeUndefined()
  }),
)

it.instance("ENG-24: revert undoes only the listed files of the listed checkpoints", () =>
  Effect.gen(function* () {
    const t = yield* setup()
    const first = yield* t.snapshot.track()
    yield* t.snapshot.write(t.a, "a2\n")
    yield* t.snapshot.write(t.b, "b2\n")
    const second = yield* t.snapshot.track()
    yield* t.snapshot.write(t.a, "a3\n")

    yield* t.snapshot.revert([{ hash: second!, files: ["a.txt"] }])
    expect(yield* read(t.a)).toBe("a2\n")
    expect(yield* read(t.b)).toBe("b2\n")

    yield* t.snapshot.revert([{ hash: first!, files: ["a.txt", "b.txt"] }])
    expect(yield* read(t.a)).toBe("a1\n")
    expect(yield* read(t.b)).toBe("b1\n")
  }),
)

it.instance("ENG-24: revert covers files written under later checkpoints of the same patch", () =>
  Effect.gen(function* () {
    const t = yield* setup()
    // A step starts at `first`; its step-finish takes `second`; the next step writes under `second`
    // while the message's patch still carries `first`.
    const first = yield* t.snapshot.track()
    yield* t.snapshot.write(t.a, "a2\n")
    yield* t.snapshot.track()
    yield* t.snapshot.write(t.c, "c1\n")
    yield* t.snapshot.write(t.a, "a3\n")
    const patch = yield* t.snapshot.patch(first!)
    expect(patch.files).toEqual(["a.txt", "c.txt"])

    yield* t.snapshot.revert([patch])
    expect(yield* read(t.a)).toBe("a1\n")
    expect(yield* read(t.c)).toBeUndefined()
  }),
)

it.instance("ENG-24: diffFull reports what changed between two checkpoints with a status per file", () =>
  Effect.gen(function* () {
    const t = yield* setup()
    const from = yield* t.snapshot.track()
    yield* t.snapshot.write(t.a, "a2\nextra\n")
    yield* t.snapshot.write(t.c, "c1\n")
    yield* t.snapshot.remove(t.b)
    const to = yield* t.snapshot.track()
    yield* t.snapshot.write(t.a, "later\n")

    const diffs = yield* t.snapshot.diffFull(from!, to!)
    const byFile = Object.fromEntries(diffs.map((item) => [item.file, item]))
    expect(Object.keys(byFile).sort()).toEqual(["a.txt", "b.txt", "c.txt"])
    expect(byFile["a.txt"]).toMatchObject({ status: "modified", additions: 2, deletions: 1 })
    expect(byFile["b.txt"]).toMatchObject({ status: "deleted", deletions: 1 })
    expect(byFile["c.txt"]).toMatchObject({ status: "added", additions: 1 })
    // The change after `to` is not part of this range.
    expect(byFile["a.txt"]?.patch).toContain("+extra")
    expect(byFile["a.txt"]?.patch).not.toContain("later")
  }),
)

it.instance("ENG-24: a file changed outside the engine's write path is not recorded", () =>
  Effect.gen(function* () {
    const t = yield* setup()
    const first = yield* t.snapshot.track()
    yield* Effect.promise(() => fs.writeFile(t.a, "shell\n"))
    expect((yield* t.snapshot.patch(first!)).files).toEqual([])
    yield* t.snapshot.restore(first!)
    expect(yield* read(t.a)).toBe("shell\n")
  }),
)

it.instance("ENG-24: nothing is recorded before the first checkpoint", () =>
  Effect.gen(function* () {
    const t = yield* setup()
    yield* t.snapshot.write(t.a, "a2\n")
    const first = yield* t.snapshot.track()
    expect((yield* t.snapshot.patch(first!)).files).toEqual([])
    expect(yield* read(t.a)).toBe("a2\n")
  }),
)
