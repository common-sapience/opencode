import { Button } from "@opencode-ai/ui/button"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tag } from "@opencode-ai/ui/tag"
import { TextField } from "@opencode-ai/ui/text-field"
import { useGatewayProvider } from "@/hooks/use-gateway-provider"
import { Show, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { SettingsList } from "./settings-list"

export const SettingsProviders: Component<{ onBack?: () => void }> = () => {
  const language = useLanguage()
  const { gateway, connected, key, setKey, error, pending, showForm, toggleEditing, save, disconnect } =
    useGatewayProvider(() => undefined)

  return (
    <div class="flex flex-col h-full px-6 pb-6 overflow-y-auto no-scrollbar">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex items-center justify-between gap-4 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.providers.title")}</h2>
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        <div class="flex flex-col gap-1" data-component="gateway-provider-section">
          <SettingsList>
            <Show
              when={gateway()}
              fallback={
                <div class="py-4 text-14-regular text-text-weak">
                  {language.t("settings.providers.connected.empty")}
                </div>
              }
            >
              {(item) => (
                <>
                  <div class="flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                    <div class="flex items-center gap-3 min-w-0">
                      <ProviderIcon id={item().id} class="size-5 shrink-0 icon-strong-base" />
                      <span class="text-14-medium text-text-strong truncate">{item().name}</span>
                      <Show when={connected()}>
                        <Tag>{language.t("provider.connect.method.apiKey")}</Tag>
                      </Show>
                    </div>
                    <Show when={connected()}>
                      <div class="flex items-center gap-1">
                        <Button size="large" variant="ghost" onClick={toggleEditing}>
                          {language.t("common.edit")}
                        </Button>
                        <Button size="large" variant="ghost" onClick={() => void disconnect()}>
                          {language.t("common.disconnect")}
                        </Button>
                      </div>
                    </Show>
                  </div>
                  <Show when={showForm()}>
                    <form
                      class="flex flex-col gap-2 py-3 border-b border-border-weak-base last:border-none"
                      onSubmit={(event) => void save(event)}
                    >
                      <div class="flex w-full items-center gap-2">
                        <div class="flex-1">
                          <TextField
                            type="password"
                            label={language.t("provider.connect.apiKey.label", { provider: item().name })}
                            hideLabel
                            value={key()}
                            onChange={setKey}
                            placeholder={language.t("provider.connect.apiKey.placeholder")}
                            spellcheck={false}
                            autocorrect="off"
                            autocomplete="off"
                            autocapitalize="off"
                            autofocus
                          />
                        </div>
                        <Button type="submit" size="large" variant="primary" disabled={pending()}>
                          {pending() ? language.t("common.saving") : language.t("common.save")}
                        </Button>
                      </div>
                      <Show when={error()}>
                        {(message) => <p class="text-12-regular text-text-weak">{message()}</p>}
                      </Show>
                    </form>
                  </Show>
                </>
              )}
            </Show>
          </SettingsList>
        </div>
      </div>
    </div>
  )
}
