
type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.OPENCODE_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

// The product has no update feed of its own yet; the upstream feed was removed from the build
// config, so the updater stays off until one exists.
export const UPDATER_ENABLED = false
