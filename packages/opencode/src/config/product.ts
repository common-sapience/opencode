export * as Product from "./product"

import { existsSync, readFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

// The product's managed configuration (ENG-04, ENG-19) ships inside the engine package as data. It
// has to work with nothing configured at all: the host sets a variable only when it wants a
// different location, and every variable the managed config names through `{env:...}` is given a
// value here, before any configuration file is read. An unset variable substitutes to an empty
// string, which would turn `{env:DIR}/*` into `/*` and `node {env:ENTRY}` into `node ""`.

const PRODUCT_DIR = "HARNESS_PRODUCT_DIR"
const BROWSER_ENTRY = "HARNESS_BROWSER_MCP_ENTRY"
const BROWSER_HEADLESS = "HARNESS_BROWSER_HEADLESS"
const BROWSER_AUTO_CONNECT = "HARNESS_BROWSER_AUTO_CONNECT"

const BROWSER_PACKAGE = "chrome-devtools-mcp"

/**
 * The model gateway the product ships (ENG-12, RULE-02). Its address is fixed in the managed
 * configuration; the key and the models are the user's, entered once in the client and kept by the
 * engine's auth store and the user's own configuration file. Nothing about it comes from the
 * environment.
 */
export const GATEWAY_PROVIDER = "platform"

// The product is headed and launches its own Chrome unless the host says otherwise. The defaults are
// written out rather than left unset so the managed config never emits a bare `--headless=`.
const BROWSER_HEADLESS_DEFAULT = "false"
const BROWSER_AUTO_CONNECT_DEFAULT = "false"

// Where the engine's own files sit: the package directory in a source checkout, and the directory
// holding the executable once compiled, where module paths no longer exist on disk. A built bundle
// therefore has to ship `product/` and `node_modules/<browser package>` next to the binary.
function roots() {
  const out: string[] = []
  const add = (value: string | undefined) => {
    if (value && !out.includes(value)) out.push(value)
  }
  try {
    add(path.resolve(fileURLToPath(new URL("../../", import.meta.url))))
  } catch {
    // A compiled binary has no filesystem module path; the executable's own directory covers it.
  }
  try {
    const executable = path.dirname(process.execPath)
    add(executable)
    add(path.dirname(executable))
  } catch {
    // No executable path means there is nothing else to probe.
  }
  return out
}

function firstExisting(candidates: string[]) {
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // An unreadable candidate is the same as a missing one.
    }
  }
  return undefined
}

function lazy<T>(resolve: () => T) {
  let done = false
  let value: T
  return () => {
    if (!done) {
      value = resolve()
      done = true
    }
    return value
  }
}

const shippedDirectory = lazy(() => firstExisting(roots().map((root) => path.join(root, "product"))))

// The entry point comes from the installed package's own manifest, so the path is never written down
// twice and a package that moves its bin keeps working.
function binFromManifest(directory: string) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"))
    const bin = parsed?.bin
    if (typeof bin === "string") return bin
    if (bin && typeof bin[BROWSER_PACKAGE] === "string") return bin[BROWSER_PACKAGE] as string
  } catch {
    // A missing or unreadable manifest means this candidate is not an installed package.
  }
  return undefined
}

const shippedBrowserEntry = lazy(() => {
  for (const root of roots()) {
    const directory = path.join(root, "node_modules", BROWSER_PACKAGE)
    const bin = binFromManifest(directory)
    if (!bin) continue
    const entry = firstExisting([path.resolve(directory, bin)])
    if (entry) return entry
  }
  return undefined
})

function exported(name: string, value: string | undefined) {
  if (!value) return undefined
  process.env[name] = value
  return value
}

/**
 * The product configuration directory, in precedence order: an explicit `HARNESS_PRODUCT_DIR`, the
 * configuration directory the host named with `OPENCODE_CONFIG_DIR` (the host's own copy of this
 * directory), the directory shipped inside the engine package. Resolving it also writes it back into
 * the environment, because the managed config addresses its own files as
 * `{env:HARNESS_PRODUCT_DIR}/...`.
 */
export function directory() {
  return exported(PRODUCT_DIR, process.env[PRODUCT_DIR] || process.env["OPENCODE_CONFIG_DIR"] || shippedDirectory())
}

/**
 * The browser MCP server's entry point (ENG-04): an explicit `HARNESS_BROWSER_MCP_ENTRY`, otherwise
 * the bin of the browser package installed next to the engine. Only a path that exists is handed on,
 * and an explicit one is never replaced by another build — a host that names a file it does not have
 * gets no browser rather than a different browser. With nothing to hand on the variable is removed,
 * so the managed config's command carries an empty argument and the server is refused instead of
 * spawned.
 */
export function browserEntry() {
  const explicit = process.env[BROWSER_ENTRY]
  const entry = explicit ? firstExisting([explicit]) : shippedBrowserEntry()
  if (!entry) delete process.env[BROWSER_ENTRY]
  return exported(BROWSER_ENTRY, entry)
}

/**
 * Gives every variable the managed configuration substitutes a value, before configuration is read.
 * Explicit values always win; only the missing ones are filled in.
 */
export function bootstrap() {
  directory()
  browserEntry()
  if (!process.env[BROWSER_HEADLESS]) process.env[BROWSER_HEADLESS] = BROWSER_HEADLESS_DEFAULT
  if (!process.env[BROWSER_AUTO_CONNECT]) process.env[BROWSER_AUTO_CONNECT] = BROWSER_AUTO_CONNECT_DEFAULT
}

bootstrap()
