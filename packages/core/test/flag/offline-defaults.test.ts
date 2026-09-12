import { afterEach, describe, expect, test } from "bun:test"
import { Flag } from "@opencode-ai/core/flag/flag"

const KEYS = ["OPENCODE_DISABLE_MODELS_FETCH", "OPENCODE_DISABLE_AUTOUPDATE"] as const

const original = new Map<string, string | undefined>()

function setEnv(key: string, value: string | undefined) {
  if (!original.has(key)) original.set(key, process.env[key])
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

afterEach(() => {
  for (const [key, value] of original) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  original.clear()
})

describe("offline defaults", () => {
  test("the models catalog fetch and the self-upgrade check are off when unset", () => {
    for (const key of KEYS) setEnv(key, undefined)
    expect(Flag.OPENCODE_DISABLE_MODELS_FETCH).toBe(true)
    expect(Flag.OPENCODE_DISABLE_AUTOUPDATE).toBe(true)
  })

  test("an empty value is treated as unset", () => {
    for (const key of KEYS) setEnv(key, "")
    expect(Flag.OPENCODE_DISABLE_MODELS_FETCH).toBe(true)
    expect(Flag.OPENCODE_DISABLE_AUTOUPDATE).toBe(true)
  })

  test("an explicit 0 or false opts back in", () => {
    setEnv("OPENCODE_DISABLE_MODELS_FETCH", "0")
    setEnv("OPENCODE_DISABLE_AUTOUPDATE", "false")
    expect(Flag.OPENCODE_DISABLE_MODELS_FETCH).toBe(false)
    expect(Flag.OPENCODE_DISABLE_AUTOUPDATE).toBe(false)
  })

  test("an explicit 1 or true keeps them off", () => {
    setEnv("OPENCODE_DISABLE_MODELS_FETCH", "1")
    setEnv("OPENCODE_DISABLE_AUTOUPDATE", "true")
    expect(Flag.OPENCODE_DISABLE_MODELS_FETCH).toBe(true)
    expect(Flag.OPENCODE_DISABLE_AUTOUPDATE).toBe(true)
  })

  test("the flags are read at access time, not at module load", () => {
    setEnv("OPENCODE_DISABLE_MODELS_FETCH", "0")
    expect(Flag.OPENCODE_DISABLE_MODELS_FETCH).toBe(false)
    setEnv("OPENCODE_DISABLE_MODELS_FETCH", "1")
    expect(Flag.OPENCODE_DISABLE_MODELS_FETCH).toBe(true)
  })
})
