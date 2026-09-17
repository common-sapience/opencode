import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { useGatewayProvider } from "@/hooks/use-gateway-provider"
import { Show, type Accessor, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

const PROVIDER_ICON_SIZE = 16

export const SettingsProvidersV2: Component<{
  directory: Accessor<string | undefined>
  onBack?: () => void
}> = (props) => {
  const language = useLanguage()
  const { gateway, connected, key, setKey, error, pending, showForm, toggleEditing, save, disconnect } =
    useGatewayProvider(props.directory)

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
                        <ButtonV2 size="normal" variant="ghost-muted" onClick={toggleEditing}>
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
