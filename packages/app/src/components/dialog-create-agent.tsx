import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createStore } from "solid-js/store"
import { Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { useServerSDK } from "@/context/server-sdk"
import { errorMessage } from "@/pages/layout/helpers"

// New agent (UI-03, D-02): a name and a job description, written by the engine as an agent
// definition (ENG-21). The engine's refusal is shown as is; the client adds no rules of its own.
export function DialogCreateAgent() {
  const language = useLanguage()
  const dialog = useDialog()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const navigate = useNavigate()
  const [store, setStore] = createStore({ name: "", description: "", pending: false, error: "" })

  const submit = async (event: Event) => {
    event.preventDefault()
    if (store.pending) return
    setStore({ pending: true, error: "" })
    const result = await serverSDK()
      .client.global.agent.create({
        agentDefinitionCreateInput: { name: store.name.trim(), description: store.description.trim() },
      })
      .then((response) => {
        if (response.error) throw response.error
        return response.data
      })
      .catch((cause: unknown) => {
        setStore({ pending: false, error: errorMessage(cause, language.t("common.requestFailed")) })
        return undefined
      })
    if (!result) return
    dialog.close()
    // A new agent opens its first session right away (UI-03).
    const home = serverSync().data.path.home
    if (home) navigate(`/${base64Encode(home)}/session?agent=${encodeURIComponent(result.name)}`)
  }

  const ready = () => store.name.trim().length > 0 && store.description.trim().length > 0

  return (
    <Dialog title={language.t("dialog.agent.create.title")} class="w-full max-w-[480px] mx-auto">
      <form onSubmit={submit} class="flex flex-col gap-6 p-6 pt-0">
        <div class="flex flex-col gap-4">
          <TextField
            autofocus
            type="text"
            label={language.t("dialog.agent.create.name")}
            placeholder={language.t("dialog.agent.create.name.placeholder")}
            value={store.name}
            onChange={(value) => setStore("name", value)}
          />
          <TextField
            multiline
            label={language.t("dialog.agent.create.description")}
            placeholder={language.t("dialog.agent.create.description.placeholder")}
            value={store.description}
            onChange={(value) => setStore("description", value)}
          />
          <Show when={store.error}>
            <div class="text-12-regular text-text-critical" data-component="agent-create-error">
              {store.error}
            </div>
          </Show>
        </div>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" size="large" disabled={store.pending || !ready()}>
            {store.pending ? language.t("dialog.agent.create.creating") : language.t("dialog.agent.create.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
