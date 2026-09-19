import { describe, expect, test } from "bun:test"

import { appEnv } from "./app-env"

describe("app env", () => {
  test("the engine never walks the opened directory", () => {
    const env = appEnv({ userDataPath: "/data", shellEnv: null, stateHome: undefined })

    expect(env.OPENCODE_EXPERIMENTAL_FILEWATCHER).toBe("false")
    expect(env.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY).toBe("false")
  })

  test("the watcher service stays on so the branch name follows .git/HEAD", () => {
    const env = appEnv({
      userDataPath: "/data",
      shellEnv: { OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "true" },
      stateHome: undefined,
    })

    expect(env.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER).toBe("false")
  })

  test("a shell environment cannot switch directory walks back on", () => {
    const env = appEnv({
      userDataPath: "/data",
      shellEnv: {
        PATH: "/shell/bin",
        OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
        OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
      },
      stateHome: undefined,
    })

    expect(env.PATH).toBe("/shell/bin")
    expect(env.OPENCODE_EXPERIMENTAL_FILEWATCHER).toBe("false")
    expect(env.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY).toBe("false")
  })

  test("keeps the client marker and an existing state home", () => {
    expect(appEnv({ userDataPath: "/data", shellEnv: null, stateHome: undefined })).toMatchObject({
      OPENCODE_CLIENT: "desktop",
      XDG_STATE_HOME: "/data",
    })
    expect(appEnv({ userDataPath: "/data", shellEnv: null, stateHome: "/state" }).XDG_STATE_HOME).toBe("/state")
  })
})
