type RefreshOps = {
  loadedDirs: () => string[]
  loadedFiles: () => string[]
  openFiles: () => string[]
  refreshDir: (path: string) => void
  loadFile: (path: string) => void
}

// The engine does not watch the working directory, so a change made outside its own file tools
// reaches the panel only when the panel asks again. The cost is what the user has expanded and
// opened, never the size of the directory.
export function refreshLoaded(ops: RefreshOps) {
  for (const dir of ops.loadedDirs()) ops.refreshDir(dir)
  for (const file of new Set([...ops.loadedFiles(), ...ops.openFiles()])) ops.loadFile(file)
}

type ReturnRefreshInput = {
  refresh: () => void
  visible: () => boolean
  now: () => number
  minIntervalMs: number
}

// Focus and visibility usually fire together when a window comes back.
export function createReturnRefresh(input: ReturnRefreshInput) {
  let last = Number.NEGATIVE_INFINITY
  return () => {
    if (!input.visible()) return
    const current = input.now()
    if (current - last < input.minIntervalMs) return
    last = current
    input.refresh()
  }
}
