import { describe, expect, test } from "bun:test"

// The flag module snapshots process.env at import time, so each case imports a fresh copy.
async function loadFlag(env: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    const mod = await import(`@opencode-ai/core/flag/flag?offline-defaults=${Math.random()}`)
    return mod.Flag as Record<string, unknown>
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe("offline defaults", () => {
  test("the models catalog fetch and the self-upgrade check are off when unset", async () => {
    const flag = await loadFlag({
      OPENCODE_DISABLE_MODELS_FETCH: undefined,
      OPENCODE_DISABLE_AUTOUPDATE: undefined,
    })
    expect(flag["OPENCODE_DISABLE_MODELS_FETCH"]).toBe(true)
    expect(flag["OPENCODE_DISABLE_AUTOUPDATE"]).toBe(true)
  })

  test("an explicit 0 or false opts back in", async () => {
    const zero = await loadFlag({
      OPENCODE_DISABLE_MODELS_FETCH: "0",
      OPENCODE_DISABLE_AUTOUPDATE: "false",
    })
    expect(zero["OPENCODE_DISABLE_MODELS_FETCH"]).toBe(false)
    expect(zero["OPENCODE_DISABLE_AUTOUPDATE"]).toBe(false)
  })

  test("an explicit 1 or true keeps them off", async () => {
    const one = await loadFlag({
      OPENCODE_DISABLE_MODELS_FETCH: "1",
      OPENCODE_DISABLE_AUTOUPDATE: "true",
    })
    expect(one["OPENCODE_DISABLE_MODELS_FETCH"]).toBe(true)
    expect(one["OPENCODE_DISABLE_AUTOUPDATE"]).toBe(true)
  })

  test("an empty value is treated as unset", async () => {
    const empty = await loadFlag({
      OPENCODE_DISABLE_MODELS_FETCH: "",
      OPENCODE_DISABLE_AUTOUPDATE: "",
    })
    expect(empty["OPENCODE_DISABLE_MODELS_FETCH"]).toBe(true)
    expect(empty["OPENCODE_DISABLE_AUTOUPDATE"]).toBe(true)
  })
})
