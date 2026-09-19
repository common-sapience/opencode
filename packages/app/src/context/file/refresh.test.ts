import { describe, expect, test } from "bun:test"
import { createReturnRefresh, refreshLoaded } from "./refresh"

describe("refreshLoaded", () => {
  test("re-reads every loaded directory and every loaded or open file once", () => {
    const dirs: string[] = []
    const files: string[] = []

    refreshLoaded({
      loadedDirs: () => ["", "src", "src/app"],
      loadedFiles: () => ["src/a.ts", "notes.md"],
      openFiles: () => ["notes.md", "README.md"],
      refreshDir: (dir) => dirs.push(dir),
      loadFile: (file) => files.push(file),
    })

    expect(dirs).toEqual(["", "src", "src/app"])
    expect(files).toEqual(["src/a.ts", "notes.md", "README.md"])
  })

  test("does nothing when nothing is loaded", () => {
    const calls: string[] = []

    refreshLoaded({
      loadedDirs: () => [],
      loadedFiles: () => [],
      openFiles: () => [],
      refreshDir: (dir) => calls.push(dir),
      loadFile: (file) => calls.push(file),
    })

    expect(calls).toEqual([])
  })
})

describe("createReturnRefresh", () => {
  test("refreshes when the window comes back and is visible", () => {
    let count = 0
    const onReturn = createReturnRefresh({
      refresh: () => count++,
      visible: () => true,
      now: () => 10_000,
      minIntervalMs: 2_000,
    })

    onReturn()

    expect(count).toBe(1)
  })

  test("skips while the page is hidden", () => {
    let count = 0
    const onReturn = createReturnRefresh({
      refresh: () => count++,
      visible: () => false,
      now: () => 10_000,
      minIntervalMs: 2_000,
    })

    onReturn()

    expect(count).toBe(0)
  })

  test("focus and visibility firing together cost one refresh", () => {
    let count = 0
    let time = 10_000
    const onReturn = createReturnRefresh({
      refresh: () => count++,
      visible: () => true,
      now: () => time,
      minIntervalMs: 2_000,
    })

    onReturn()
    time += 50
    onReturn()
    expect(count).toBe(1)

    time += 2_000
    onReturn()
    expect(count).toBe(2)
  })
})
