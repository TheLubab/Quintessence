import { useCallback, useEffect, useState } from 'react'

import { LayersIcon } from '@solar-icons/react/linear'
import {
  type TLEditorSnapshot,
  type TLStore,
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils
} from 'tldraw'

import { describeNewerWriter, sequencesAhead } from '@/shared/canvas-skew'
import type { CanvasWriter } from '@/shared/types'

export type CanvasFetch = {
  document: TLEditorSnapshot['document'] | null
  writer?: CanvasWriter
}

export type CanvasSkew = {
  newer: boolean
  writer?: CanvasWriter
  detail: string
}

type SnapshotResult = {
  snapshot?: TLEditorSnapshot['document']
  skew: CanvasSkew | null
}

let runtimeSchemaCache: TLStore['schema'] | null = null

function runtimeSchema(): TLStore['schema'] {
  runtimeSchemaCache ??= createTLStore({
    shapeUtils: defaultShapeUtils,
    bindingUtils: defaultBindingUtils
  }).schema
  return runtimeSchemaCache
}

export function detectCanvasSkew(
  document: NonNullable<TLEditorSnapshot['document']>,
  writer: CanvasWriter | undefined
): CanvasSkew | null {
  const schema = runtimeSchema()
  try {
    if (schema.migrateStoreSnapshot(document).type === 'success') return null
  } catch {}
  const ahead = sequencesAhead(document.schema, schema.serialize().sequences)
  if (ahead.length > 0) {
    return { newer: true, writer, detail: describeNewerWriter(writer, ahead) }
  }
  return { newer: false, writer, detail: 'The saved snapshot failed to load.' }
}

export function useCanvasSnapshot(workspaceId: string): {
  loaded: boolean
  snapshot: TLEditorSnapshot['document'] | undefined
  skew: CanvasSkew | null
  flagSkew: (skew: CanvasSkew) => void
} {
  const [result, setResult] = useState<SnapshotResult | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/workspaces/${workspaceId}/canvas`)
      .then(response => response.json())
      .then((data: CanvasFetch) => {
        if (cancelled) return
        let snapshot: TLEditorSnapshot['document'] | undefined
        let skew: CanvasSkew | null = null
        if (data?.document) {
          skew = detectCanvasSkew(data.document, data.writer)
          if (!skew) snapshot = data.document
        }
        setResult({ snapshot, skew })
      })
      .catch(() => {
        if (!cancelled) setResult({ skew: null })
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const flagSkew = useCallback((skew: CanvasSkew) => {
    setResult(previous => ({ snapshot: previous?.snapshot, skew }))
  }, [])

  return {
    loaded: result !== null,
    snapshot: result?.snapshot,
    skew: result?.skew ?? null,
    flagSkew
  }
}

export function CanvasSkewNotice({ skew }: { skew: CanvasSkew }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:16px_16px] p-6">
      <div className="flex max-w-md animate-in flex-col gap-3 rounded-lg bg-background p-6 shadow-xs duration-200 fade-in-0 zoom-in-95">
        <div className="flex items-center gap-2">
          <LayersIcon size={20} strokeWidth={1.5} className="shrink-0 text-amber-600" />
          <h2 className="font-medium text-foreground">
            {skew.newer ? 'This canvas needs a newer Quint' : 'This canvas couldn’t be loaded'}
          </h2>
        </div>
        {skew.newer ? (
          <>
            <p className="text-sm text-pretty text-muted-foreground">
              This canvas was saved by a newer version of Quint
              {skew.writer ? ` (v${skew.writer.quint})` : ''}.<br /> Please update Quint and restart
              the server:
            </p>
            <code className="self-start rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
              quint update
            </code>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{skew.detail}</p>
        )}
      </div>
    </div>
  )
}
