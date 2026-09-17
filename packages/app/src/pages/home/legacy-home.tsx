import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useNavigate } from "@solidjs/router"
import { createEffect } from "solid-js"

// The product has no project page (UI-01, D-04): every session lives in the user's home directory,
// so the root route opens that directory and lands on its sessions.
export function LegacyHome() {
  const sync = useServerSync()
  const server = useServer()
  const navigate = useNavigate()

  createEffect(() => {
    const home = sync().data.path.home
    if (!home) return
    server.projects.open(home)
    server.projects.touch(home)
    navigate(`/${base64Encode(home)}/session`, { replace: true })
  })

  return <div class="flex-1 min-h-0" />
}
