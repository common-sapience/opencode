import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { List } from "@opencode-ai/ui/list"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { toLegacySummary } from "@/context/global-sync/home-session-index"
import { errorMessage } from "@/pages/layout/helpers"
import { showToast } from "@/utils/toast"

// Archived sessions live behind the sidebar's archive button, out of the agent list: the only
// thing to do with one here is to unarchive it, which puts it back under its agent (UI-02).
export function DialogArchivedSessions(props: { unarchive: (session: Session) => Promise<void> }) {
  const language = useLanguage()
  const dialog = useDialog()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const queryClient = useQueryClient()

  const archived = useQuery(() => ({
    queryKey: [...serverSync().homeSessions.indexKey, "archived"],
    queryFn: async ({ signal }) => {
      const response = await serverSDK().client.v2.session.list({ limit: 500, order: "desc" }, { signal })
      return (response.data?.data ?? [])
        .filter((item) => !item.parentID && typeof item.time.archived === "number")
        .map(toLegacySummary)
    },
    retry: false,
  }))
  const items = createMemo(() => archived.data ?? [])

  const restore = async (session: Session) => {
    try {
      await props.unarchive(session)
      await Promise.all([
        archived.refetch(),
        queryClient.invalidateQueries({ queryKey: serverSync().homeSessions.indexKey }),
      ])
    } catch (cause: unknown) {
      showToast({ title: language.t("common.requestFailed"), description: errorMessage(cause, "") })
    }
  }

  return (
    <Dialog title={language.t("sidebar.archived.title")} class="w-full max-w-[560px] mx-auto">
      <List
        class="flex-1 px-3 pb-3 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0"
        search={{ placeholder: language.t("common.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("sidebar.archived.empty")}
        key={(x) => x.id}
        items={items}
        filterKeys={["title"]}
        onSelect={() => {}}
      >
        {(item) => (
          <div class="w-full flex items-center gap-3" data-component="archived-session" data-session={item.id}>
            <span class="truncate flex-1 min-w-0 text-left font-normal">{item.title}</span>
            <span class="text-text-weak shrink-0 font-normal capitalize">{item.agent ?? ""}</span>
            <Button
              variant="ghost"
              size="small"
              data-action="session-unarchive"
              onClick={(event: MouseEvent) => {
                event.stopPropagation()
                void restore(item)
              }}
            >
              {language.t("common.unarchive")}
            </Button>
          </div>
        )}
      </List>
      <div class="flex justify-end px-6 pb-6">
        <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
          {language.t("common.close")}
        </Button>
      </div>
    </Dialog>
  )
}
