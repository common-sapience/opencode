export type AppEnvInput = {
  userDataPath: string
  shellEnv: Record<string, string> | null
  stateHome: string | undefined
}

// The opened directory can be the whole home directory, so nothing in the engine may walk it: the
// recursive file watch and the project icon search both do, and either one stalls the engine for
// minutes. The watcher service itself stays on: without the recursive watch it only subscribes to
// the top level of .git with everything but HEAD ignored, which is what keeps the branch name live.
// The switches come after the shell environment so a user's shell cannot change them.
export function appEnv(input: AppEnvInput): Record<string, string> {
  return {
    ...input.shellEnv,
    OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "false",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "false",
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "false",
    OPENCODE_CLIENT: "desktop",
    XDG_STATE_HOME: input.stateHome ?? input.userDataPath,
  }
}
