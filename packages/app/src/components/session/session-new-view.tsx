import { useNavigate } from "@solidjs/router"
import { createMemo } from "solid-js"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Button } from "@opencode-ai/ui/button"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"

const ROOT_CLASS = "size-full flex flex-col"

interface NewSessionViewProps {
  worktree: string
}

// The empty session: the title and the directory the session will work in. The directory is the
// home directory unless the user picks another one here (UI-08); picking one moves the draft to that
// directory's route, so the file panel, the terminal and the first message all land there.
export function NewSessionView(_props: NewSessionViewProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const server = useServer()
  const serverSync = useServerSync()
  const local = useLocal()
  const navigate = useNavigate()
  const pickDirectory = useDirectoryPicker()

  const home = createMemo(() => serverSync().data.path.home)
  const shown = createMemo(() => {
    const directory = sdk().directory
    const root = home()
    if (root && directory === root) return "~"
    if (root && directory.startsWith(root + "/")) return "~" + directory.slice(root.length)
    return directory
  })

  const choose = () => {
    const current = server.current
    if (!current) return
    pickDirectory({
      server: current,
      title: language.t("session.new.directory.choose"),
      onSelect: (result) => {
        const directory = Array.isArray(result) ? result[0] : result
        if (!directory) return
        const agent = local.agent.current()?.name
        const query = agent ? `?agent=${encodeURIComponent(agent)}` : ""
        navigate(`/${base64Encode(directory)}/session${query}`)
      },
    })
  }

  return (
    <div class={ROOT_CLASS}>
      <div class="h-12 shrink-0" aria-hidden />
      <div class="flex-1 px-6 pb-30 flex items-center justify-center text-center">
        <div class="flex flex-col items-center gap-4">
          <div class="text-20-medium text-text-strong">{language.t("session.new.title")}</div>
          <div class="flex items-center gap-2 min-h-5">
            <span class="text-12-medium text-text-weak">{language.t("session.new.directory")}</span>
            <span
              class="text-12-medium text-text-strong select-text max-w-160 truncate"
              data-component="session-directory"
            >
              {shown()}
            </span>
            <Button variant="ghost" size="small" data-action="session-directory-choose" onClick={choose}>
              {language.t("session.new.directory.choose")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
