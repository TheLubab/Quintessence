import type { ReactNode } from 'react'

import type { CompiledQuintlet } from '@/shared/types'
import {
  DEFAULT_QUICK_ACCESS_WIDGET,
  DEFAULT_SUGGESTIONS_WIDGET,
  isDefaultWidget,
  type DefaultWidgetId
} from '@/shared/default-widgets'

import { QuickAccessWidget } from './quick-access-widget'
import { SuggestionsWidget } from './suggestions-widget'

export type DefaultWidgetRenderContext = {
  quintlets: CompiledQuintlet[]
  onOpenQuintlet: (quintletId: string) => void
  onCreateQuintlet: () => void
  onStartPrompt: (prompt: string) => void
  showOnboarding: boolean
}

type DefaultWidgetRenderer = (context: DefaultWidgetRenderContext) => ReactNode

const DEFAULT_WIDGET_RENDERERS: Record<DefaultWidgetId, DefaultWidgetRenderer> = {
  [DEFAULT_QUICK_ACCESS_WIDGET.id]: context => (
    <QuickAccessWidget
      quintlets={context.quintlets}
      onOpenQuintlet={context.onOpenQuintlet}
      onCreateQuintlet={context.onCreateQuintlet}
      showOnboarding={context.showOnboarding}
    />
  ),
  [DEFAULT_SUGGESTIONS_WIDGET.id]: context => <SuggestionsWidget onStartPrompt={context.onStartPrompt} />
}

export function renderDefaultWidget(
  id: string,
  context: DefaultWidgetRenderContext
): ReactNode | undefined {
  if (!isDefaultWidget(id)) return undefined
  return DEFAULT_WIDGET_RENDERERS[id](context)
}
