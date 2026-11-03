import type { Model, WorkspaceType } from '@/shared/types'

export const DEFAULT_EFFORT = 'high'

// Resolve the same concrete row for the picker and the outgoing chat request.
// Unavailable selections fall back to the resolved default, then the first row.
export function resolveSelectedModel(
  models: readonly Model[],
  selectedModel: string | undefined,
  defaultModel = models.find(model => model.value === 'default')?.resolvedModel
): Model | undefined {
  const choices = models.filter(model => model.value !== 'default')
  return (
    choices.find(model => model.value === selectedModel) ??
    choices.find(model => (model.resolvedModel ?? model.value) === defaultModel) ??
    choices[0]
  )
}

export function resolveDisplayedEffort(
  levels: readonly string[],
  selectedEffort: string | undefined,
  modelDefault?: string
): string | undefined {
  if (selectedEffort && levels.includes(selectedEffort)) return selectedEffort
  if (modelDefault && levels.includes(modelDefault)) return modelDefault
  if (levels.includes(DEFAULT_EFFORT)) return DEFAULT_EFFORT
  return levels[levels.length - 1]
}

export function resolveEffortIndex(
  levels: readonly string[],
  selectedEffort: string | undefined,
  modelDefault?: string
): number {
  const displayedEffort = resolveDisplayedEffort(levels, selectedEffort, modelDefault)
  return displayedEffort ? levels.indexOf(displayedEffort) : -1
}

export function hasEffortChoice(levels: readonly string[]): boolean {
  return levels.length > 1
}

export function resolveFastMode(model: Model, selectedFastMode: boolean | undefined): boolean {
  if (model.supportsFastMode !== true) return false
  return selectedFastMode ?? model.defaultFastMode ?? false
}

export function sortModelsByProviderOrder(models: Model[], _provider: WorkspaceType): Model[] {
  return models
}

export type ModelGroup = { label: string; models: Model[] }

// Picker sections. Catalogs that group models get one section per `group`, in
// first-appearance order; everything else stays a single "Models" section.
export function groupModels(models: readonly Model[], fallbackLabel: string): ModelGroup[] {
  const groups: ModelGroup[] = []
  for (const model of models) {
    const label = model.group ?? fallbackLabel
    const existing = groups.find(group => group.label === label)
    if (existing) existing.models.push(model)
    else groups.push({ label, models: [model] })
  }
  return groups
}
