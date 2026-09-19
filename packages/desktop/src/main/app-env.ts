export type AppEnvInput = {
  userDataPath: string
  shellEnv: Record<string, string> | null
  stateHome: string | undefined
}

// The opened directory can be the whole home directory, so nothing in the engine may walk it: the
// file watcher and the project icon search both do, and either one stalls the engine for minutes.
// The switches come after the shell environment so a user's shell cannot turn them back on.
export function appEnv(input: AppEnvInput): Record<string, string> {
  return {
    ...input.shellEnv,
    OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "false",
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "false",
    OPENCODE_CLIENT: "desktop",
    XDG_STATE_HOME: input.stateHome ?? input.userDataPath,
  }
}
