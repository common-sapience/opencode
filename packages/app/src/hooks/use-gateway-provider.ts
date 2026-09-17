import { createMemo, createSignal, type Accessor } from "solid-js"
import { showToast } from "@/utils/toast"
import { useProviders } from "@/hooks/use-providers"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"

// The product has one provider: the model gateway the shipped configuration defines. Its address is
// fixed there and its models are listed from it by the engine, so all a user enters is the key. The
// gateway is the config-sourced provider the engine lists; while it has no key the engine lists it
// with no models and outside the connected set. Both settings dialogs render this same state.
export function useGatewayProvider(directory: Accessor<string | undefined>) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const serverSync = useServerSync()
  const providers = useProviders(directory)

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
      const dir = directory()
      await serverSdk().api.integration.connect.key({
        integrationID: provider.id,
        location: dir ? { directory: dir } : undefined,
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

  return {
    gateway,
    connected,
    key,
    setKey,
    error,
    pending,
    showForm,
    toggleEditing: () => setEditing((v) => !v),
    save,
    disconnect,
  }
}
