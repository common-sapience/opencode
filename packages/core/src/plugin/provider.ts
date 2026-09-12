import { OpenAICompatiblePlugin } from "./provider/openai-compatible"
import type { PluginInternal } from "./internal"
import type { Scope } from "effect"

// ENG-12 / RULE-02: the platform gateway speaks the openai-compatible API, so that adapter is
// the only one registered. The vendor adapters and the dynamic npm loader are removed, which
// means a config naming another provider finds no SDK and its models never become selectable.
export const ProviderPlugins: PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>[] = [
  OpenAICompatiblePlugin,
]
