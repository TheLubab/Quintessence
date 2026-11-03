import type { Model } from './types'

// Model ownership and hosting are separate. Provider-qualified IDs retain
// their exact wire spelling; only the final model name determines eligibility.
export function isMetaModelId(id: string): boolean {
  const name = id.split('/').at(-1) ?? ''
  return /^(?:muse-(?:spark|wonder|glimmer)(?:-open)?-\d[\w.-]*|llama-?\d[\w.-]*)$/i.test(name)
}

export function resolveMetaModel(models: readonly Model[], requested?: string): string {
  const eligible = models.filter(model => isMetaModelId(model.resolvedModel ?? model.value))
  const chosen =
    requested && requested !== 'default'
      ? eligible.find(model => model.value === requested || model.resolvedModel === requested)
      : (eligible.find(model => model.value === 'default') ?? eligible[0])
  if (!chosen) {
    throw new Error(
      requested && requested !== 'default'
        ? 'Choose an available Meta model'
        : 'No supported Meta models are available'
    )
  }
  return chosen.resolvedModel ?? chosen.value
}

// Prefer a moderate supported level rather than inheriting a runtime maximum.
export function defaultMetaEffort(
  levels: readonly string[],
  runtimeDefault?: string
): string | undefined {
  for (const effort of ['medium', 'low', 'minimal', 'high']) {
    if (levels.includes(effort)) return effort
  }
  return runtimeDefault && levels.includes(runtimeDefault) ? runtimeDefault : levels[0]
}
