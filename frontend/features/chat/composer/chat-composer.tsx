import { toast } from '@/frontend/components/ui/toast'
import { TextAttachmentChip } from './attachments/text-attachment-chip'
import { DrawingAttachmentChip } from './attachments/drawing-attachment-chip'
import { FileAttachmentChip } from './attachments/file-attachment-chip'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { draftSessionId, composerDraftKey } from '@/shared/session-drafts'
import { useCurrentTabId } from '../sessions/use-selected-session'

import { PaperclipIcon, PenNewRoundIcon } from '@solar-icons/react/linear'
import { StopIcon } from '@solar-icons/react/bold'

import {
  canSubmitComposerAction,
  Composer,
  ComposerFooter,
  ComposerSubmitButton,
  ComposerTextarea
} from '@/frontend/components/shared/composer'
import { Button } from '@/frontend/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/frontend/components/ui/tooltip'
import { stageComposerFiles } from '@/frontend/features/chat/composer/attachments/draft-attachments'
import { cn } from '@/frontend/utils/cn'
import type { AgentAvailability } from '@/frontend/utils/agent-availability'
import { useWorkspaceId } from '@/frontend/features/workspace/workspace-context'
import { useLatestRef } from '@/frontend/utils/use-latest-ref'
import { attachmentKey, liveStore, useLive } from '@/frontend/features/chat/chat-store'
import type { StagedAttachment } from '@/frontend/features/chat/composer/attachments/types'
import { useUiStore } from '@/frontend/store/ui'

import { ModelPicker } from './model-picker'

export type ComposerAnnotationControls = {
  active: boolean
  finish: () => Promise<void>
  onToggle: () => void
  onRemove: (localId: string) => void
}

type ChatComposerProps = {
  composerRef: RefObject<HTMLTextAreaElement | null>
  onSend: (text: string) => void | Promise<void>
  onStop: () => void
  processing: boolean
  sessionId: string | null
  modelSessionId: string | null
  availability: AgentAvailability
  chatReady: boolean
  annotation?: ComposerAnnotationControls
  onRemoveDrawing?: (localId: string) => void
  allowFiles?: boolean
  placeholder?: string
}

// Draft text is persisted per chat or fresh tab, while attachments remain ephemeral. Both stores are subscribed here so a keystroke or upload
// re-renders only the composer.
export function ChatComposer({
  composerRef,
  onSend,
  onStop,
  processing,
  sessionId,
  modelSessionId,
  availability,
  chatReady,
  annotation,
  onRemoveDrawing,
  allowFiles = true,
  placeholder
}: ChatComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const workspaceId = useWorkspaceId()
  const tabId = useCurrentTabId()
  const draftKey = composerDraftKey(workspaceId, sessionId ?? draftSessionId(tabId))
  const value = useUiStore(s => s.composerDrafts[draftKey] ?? '')
  useEffect(() => {
    if (tabId === 'dashboard') useUiStore.getState().moveComposerDraft(workspaceId, draftKey)
  }, [tabId, workspaceId, draftKey])
  const valueRef = useLatestRef(value)
  const attachments = useLive(s => s.attachments[attachmentKey(workspaceId, sessionId)] ?? EMPTY)
  const [dragOver, setDragOver] = useState(false)

  const uploading = attachments.some(a => a.kind !== 'text' && a.status === 'uploading')
  // A draft annotation counts as sendable content: send() finishes the drawing
  // first, which uploads it before the message goes out.
  const hasSendable = attachments.some(
    a => a.kind === 'text' || a.status === 'ready' || a.status === 'draft'
  )
  const hasContent = value.trim().length > 0 || hasSendable
  const canSend = chatReady && canSubmitComposerAction(hasContent, uploading, availability)

  const onChange = (next: string) => {
    valueRef.current = next
    useUiStore.getState().setComposerDraft(draftKey, next)
  }

  const addFiles = (files: File[]) => {
    if (allowFiles) stageComposerFiles({ workspaceId, sessionId }, files)
  }

  // Guards the await window while an annotation finishes: no re-entry from a
  // second Enter, and the draft is re-read afterwards so text typed during the
  // upload isn't lost.
  const sendingRef = useRef(false)

  const removeAttachment = (attachment: StagedAttachment) => {
    if (attachment.kind === 'drawing' && onRemoveDrawing) {
      onRemoveDrawing(attachment.localId)
      return
    }
    liveStore.getState().removeAttachment(workspaceId, attachment.localId)
  }

  const send = async () => {
    if (!canSend || sendingRef.current) return
    sendingRef.current = true
    try {
      await annotation?.finish()
      await onSend(valueRef.current)
      valueRef.current = ''
      useUiStore.getState().setComposerDraft(draftKey, null)
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Couldn’t send message',
        type: 'error'
      })
    } finally {
      sendingRef.current = false
    }
  }

  return (
    <Composer
      composerRef={composerRef}
      onSubmit={e => {
        e.preventDefault()
        void send()
      }}
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        if (allowFiles) setDragOver(true)
      }}
      onDragLeave={e => {
        if (!allowFiles) return
        // Ignore leaves into child elements — only reset when leaving the form.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDragOver(false)
      }}
      onDrop={e => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragOver(false)
        addFiles(Array.from(e.dataTransfer.files))
      }}
      className={cn(dragOver && 'ring-2 ring-ring/60')}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1 pt-1 pb-1">
          {attachments
            .toSorted((a, b) => ATTACHMENT_ORDER[a.kind] - ATTACHMENT_ORDER[b.kind])
            .map(a =>
              a.kind === 'text' ? (
                <TextAttachmentChip
                  key={a.localId}
                  label={a.label}
                  onRemove={() => removeAttachment(a)}
                />
              ) : a.kind === 'drawing' ? (
                <DrawingAttachmentChip
                  key={a.localId}
                  attachment={a}
                  onRemove={() => removeAttachment(a)}
                />
              ) : (
                <FileAttachmentChip
                  key={a.localId}
                  attachment={a}
                  onRemove={() => removeAttachment(a)}
                />
              )
            )}
        </div>
      )}

      <ComposerTextarea
        textareaRef={composerRef}
        disabled={availability.status !== 'available'}
        id="chat-input"
        name="message"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
          }
        }}
        onPaste={e => {
          const files = Array.from(e.clipboardData?.files ?? [])
          if (files.length === 0) return
          e.preventDefault()
          addFiles(files)
        }}
        placeholder={processing ? 'Queue a follow-up' : (placeholder ?? 'Do anything')}
        rows={1}
      />
      <ComposerFooter>
        {allowFiles && (
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={e => {
              addFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
        )}
        <div className="mr-auto flex shrink-0 items-center gap-0.5">
          {allowFiles && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileRef.current?.click()}
                    aria-label="Attach files"
                  >
                    {/* Paperclip is too heavy compared to the nearby scribble icon */}
                    <PaperclipIcon strokeWidth={1.6} className="size-4.5!" />
                  </Button>
                }
              />
              <TooltipContent>Attach files</TooltipContent>
            </Tooltip>
          )}
          {annotation && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={annotation.onToggle}
                    className={cn(annotation.active && 'bg-accent')}
                    aria-label="Draw annotation"
                    aria-pressed={annotation.active}
                  >
                    <PenNewRoundIcon strokeWidth={1.5} />
                  </Button>
                }
              />
              <TooltipContent>Draw annotation</TooltipContent>
            </Tooltip>
          )}
        </div>
        <ModelPicker sessionId={modelSessionId} />
        {processing ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button type="button" size="icon" onClick={onStop} aria-label="Stop agent">
                  <StopIcon />
                </Button>
              }
            />
            <TooltipContent>Stop answering</TooltipContent>
          </Tooltip>
        ) : (
          <ComposerSubmitButton
            label="Send message"
            hasContent={hasContent}
            busy={uploading || !chatReady}
            availability={availability}
          />
        )}
      </ComposerFooter>
    </Composer>
  )
}

const EMPTY: StagedAttachment[] = []
const ATTACHMENT_ORDER: Record<StagedAttachment['kind'], number> = {
  file: 0,
  drawing: 1,
  text: 2
}
