// The main process tells the engine where the shipped product files are by naming the parent of
// Electron's resources directory. This asserts that the installer really puts `product/` there, on
// the platform the package was just built for.
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const MAX_DEPTH = 4
const dist = join(import.meta.dirname, "..", "dist")

function unpackedRoots(directory: string, depth: number): string[] {
  if (depth > MAX_DEPTH) return []
  const entries = readdirSync(directory).filter((name) => statSync(join(directory, name)).isDirectory())
  const resources = entries.find((name) => name.toLowerCase() === "resources")
  if (resources && existsSync(join(directory, resources, "app.asar"))) return [directory]
  return entries.flatMap((name) => unpackedRoots(join(directory, name), depth + 1))
}

const roots = unpackedRoots(dist, 0)
if (roots.length === 0) throw new Error(`no unpacked application found under ${dist}`)

const missing = roots.filter((root) => !existsSync(join(root, "product", "opencode.json")))
if (missing.length > 0) throw new Error(`product/opencode.json is not beside the resources directory in: ${missing.join(", ")}`)

console.log(`product layout ok: ${roots.join(", ")}`)
