export * as Gateway from "./gateway"

import { ModelsDev } from "@opencode-ai/core/models-dev"

/**
 * The platform gateway's model catalog (T-02): the list and the limits come only from the gateway's
 * own `GET /models`, in the OpenAI-compatible shape, so nothing about a model is written down twice.
 * A field the gateway does not send falls back to a conservative default rather than a guess about
 * a particular model.
 */

const DEFAULT_CONTEXT = 128000
const DEFAULT_OUTPUT = 8192
const TIMEOUT_MS = 15000

type Entry = {
  id: string
  name?: string
  context_length?: number
  max_completion_tokens?: number
  top_provider?: { max_completion_tokens?: number | null; context_length?: number | null }
  architecture?: { input_modalities?: string[]; output_modalities?: string[] }
  supported_parameters?: string[]
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
}

type Modality = "text" | "image" | "audio" | "video" | "pdf"
const MODALITIES: Modality[] = ["text", "image", "audio", "video", "pdf"]

function modalities(list: unknown): Modality[] {
  if (!Array.isArray(list)) return ["text"]
  const known = list.filter((item): item is Modality => MODALITIES.includes(item as Modality))
  return known.length ? known : ["text"]
}

/** Turns one gateway entry into the catalog shape the provider layer already knows how to load. */
export function toModel(entry: Entry): ModelsDev.Model | undefined {
  if (typeof entry?.id !== "string" || entry.id.trim() === "") return undefined
  const parameters = Array.isArray(entry.supported_parameters) ? entry.supported_parameters : []
  const input = modalities(entry.architecture?.input_modalities)
  return {
    id: entry.id,
    name: typeof entry.name === "string" && entry.name.trim() !== "" ? entry.name : entry.id,
    release_date: "",
    attachment: input.includes("image") || input.includes("pdf"),
    reasoning: parameters.includes("reasoning") || parameters.includes("include_reasoning"),
    temperature: parameters.length === 0 || parameters.includes("temperature"),
    tool_call: parameters.length === 0 || parameters.includes("tools"),
    limit: {
      context: finite(entry.context_length) ?? finite(entry.top_provider?.context_length) ?? DEFAULT_CONTEXT,
      output:
        finite(entry.max_completion_tokens) ?? finite(entry.top_provider?.max_completion_tokens) ?? DEFAULT_OUTPUT,
    },
    modalities: {
      input,
      output: ["text"],
    },
  }
}

/** Parses a `GET /models` body. Anything that is not a list of entries yields no models. */
export function parse(body: unknown): Record<string, ModelsDev.Model> {
  const data = (body as { data?: unknown })?.data
  if (!Array.isArray(data)) return {}
  const out: Record<string, ModelsDev.Model> = {}
  for (const entry of data) {
    const model = toModel(entry as Entry)
    if (model) out[model.id] = model
  }
  return out
}

export function modelsURL(baseURL: string) {
  return `${baseURL.replace(/\/+$/, "")}/models`
}

/**
 * Lists the gateway's models with the user's key. A gateway that answers anything but 200 is
 * reported by status: a wrong key is a 401 here, not a bare failure on the first message.
 */
export async function discover(baseURL: string, key: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(modelsURL(baseURL), {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`The model gateway answered ${response.status} to GET /models.`)
  return parse(await response.json())
}
