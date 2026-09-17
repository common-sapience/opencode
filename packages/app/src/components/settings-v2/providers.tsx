import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { showToast } from "@/utils/toast"
import { useProviders } from "@/hooks/use-providers"
import { createMemo, createSignal, Show, type Accessor, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

const PROVIDER_ICON_SIZE = 16

// The product has one provider: the model gateway the shipped configuration defines. Its address is
// fixed there and its models are listed from it by the engine, so all a user enters here is the
// key. The gateway is the config-sourced provider the engine lists; while it has no key the engine
// lists it with no models and outside the connected set.
export const SettingsProvidersV2: Component<{
  directory: Accessor<string | undefined>
  onBack?: () => void
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const serverSync = useServerSync()
  const providers = useProviders(props.directory)

  const gateway = createMemo(() => {
    for (const [, provider] of providers.all()) {
      if ("source" in provider && provider.source === "config") return provider
    }
  })
  const connected = createMemo(() => {
    const id = gateway()?.id
    return !!id && providers.connected().some((p) => p.id === id)
  })

  const [key, setKey] = createSignal("")
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const showForm = createMemo(() => !connected() || editing())

  const refresh = () =>
    serverSync()
      .refreshProviders()
      .catch(() => undefined)

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    const provider = gateway()
    if (!provider || pending()) return
    const value = key().trim()
    if (!value) {
      setError(language.t("provider.connect.apiKey.required"))
      return
    }
    setPending(true)
    setError(undefined)
    try {
      const directory = props.directory()
      await serverSdk().api.integration.connect.key({
        integrationID: provider.id,
        location: directory ? { directory } : undefined,
        key: value,
      })
      await refresh()
      if (!connected()) {
        setError(language.t("settings.providers.gateway.noModels"))
        return
      }
      setKey("")
      setEditing(false)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", { provider: provider.name }),
        description: language.t("provider.connect.toast.connected.description", { provider: provider.name }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  const disconnect = async () => {
    const provider = gateway()
    if (!provider) return
    await serverSdk()
      .client.auth.remove({ providerID: provider.id })
      .then(async () => {
        await serverSdk().client.global.dispose()
        await refresh()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: provider.name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: provider.name }),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.providers.title")}</h2>
      </div>

      <div class="settings-v2-tab-body settings-v2-providers">
        <div class="settings-v2-section" data-component="gateway-provider-section">
          <SettingsListV2>
            <Show
              when={gateway()}
              fallback={
                <div class="settings-v2-provider-empty">{language.t("settings.providers.connected.empty")}</div>
              }
            >
              {(item) => (
                <>
                  <div class="settings-v2-provider-row group">
                    <div class="settings-v2-provider-lead">
                      <ProviderIcon
                        id={item().id}
                        width={PROVIDER_ICON_SIZE}
                        height={PROVIDER_ICON_SIZE}
                        class="settings-v2-provider-icon shrink-0"
                      />
                      <div class="settings-v2-provider-main">
                        <span class="settings-v2-provider-name truncate">{item().name}</span>
                        <Show when={connected()}>
                          <Tag>{language.t("provider.connect.method.apiKey")}</Tag>
                        </Show>
                      </div>
                    </div>
                    <Show when={connected()}>
                      <div class="flex items-center gap-1">
                        <ButtonV2 size="normal" variant="ghost-muted" onClick={() => setEditing((v) => !v)}>
                          {language.t("common.edit")}
                        </ButtonV2>
                        <ButtonV2 size="normal" variant="ghost-muted" onClick={() => void disconnect()}>
                          {language.t("common.disconnect")}
                        </ButtonV2>
                      </div>
                    </Show>
                  </div>
                  <Show when={showForm()}>
                    <form class="settings-v2-provider-row" onSubmit={(event) => void save(event)}>
                      <div class="flex w-full flex-col gap-2">
                        <div class="flex w-full items-center gap-2">
                          <TextInputV2
                            appearance="base"
                            class="flex-1"
                            value={key()}
                            onInput={(event) => setKey(event.currentTarget.value)}
                            placeholder={language.t("provider.connect.apiKey.placeholder")}
                            aria-label={language.t("provider.connect.apiKey.label", { provider: item().name })}
                            spellcheck={false}
                            autocorrect="off"
                            autocomplete="off"
                            autocapitalize="off"
                            autofocus
                          />
                          <ButtonV2 type="submit" size="normal" variant="neutral" disabled={pending()}>
                            {pending() ? language.t("common.saving") : language.t("common.save")}
                          </ButtonV2>
                        </div>
                        <Show when={error()}>
                          {(message) => <p class="settings-v2-provider-description">{message()}</p>}
                        </Show>
                      </div>
                    </form>
                  </Show>
                </>
              )}
            </Show>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
