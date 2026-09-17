import { useNavigate } from "@solidjs/router"
import { createMemo, For, Show } from "solid-js"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Button } from "@opencode-ai/ui/button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { BLANK_AGENT, userAgents } from "@/pages/layout/sidebar-agents"
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
  // The home directory is the default and needs no label; only a chosen directory is named.
  const shown = createMemo(() => {
    const directory = sdk().directory
    const root = home()
    if (!root || directory === root) return ""
    if (directory.startsWith(root + "/")) return "~" + directory.slice(root.length)
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

  const agents = createMemo(() => userAgents(local.agent.list()))
  const currentAgent = createMemo(() => {
    const name = local.agent.current()?.name
    return agents().find((agent) => agent.name === name) ?? agents()[0]
  })
  const agentLabel = (agent: { name: string } | undefined) =>
    !agent ? "" : agent.name === BLANK_AGENT ? language.t("sidebar.agents.blank") : agent.name

  return (
    <div class={ROOT_CLASS}>
      <div class="h-12 shrink-0" aria-hidden />
      <div class="flex-1 px-6 pb-30 flex items-center justify-center text-center">
        <div class="flex flex-col items-center gap-6">
          <div class="text-20-medium text-text-strong">{language.t("session.new.title")}</div>
          <div class="flex flex-col items-center gap-1" data-component="session-setup">
            <DropdownMenu>
              <DropdownMenu.Trigger
                as={Button}
                variant="ghost"
                size="small"
                class="capitalize max-w-[240px]"
                data-action="session-agent"
              >
                <span class="truncate">{agentLabel(currentAgent())}</span>
                <Icon name="chevron-down" size="small" class="text-icon-weak shrink-0" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content class="mt-1 min-w-[180px]">
                  <For each={agents()}>
                    {(agent) => (
                      <DropdownMenu.Item
                        data-action="session-agent-option"
                        data-agent={agent.name}
                        onSelect={() => local.agent.set(agent.name)}
                      >
                        <DropdownMenu.ItemLabel class="capitalize">{agentLabel(agent)}</DropdownMenu.ItemLabel>
                        <Show when={agent.name === currentAgent()?.name}>
                          <Icon name="check-small" size="small" class="ml-auto text-icon-weak" />
                        </Show>
                      </DropdownMenu.Item>
                    )}
                  </For>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="small"
              class="max-w-[240px]"
              data-action="session-directory-choose"
              onClick={choose}
            >
              <span class="truncate" data-component="session-directory">
                {shown() || language.t("session.new.directory.choose")}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
