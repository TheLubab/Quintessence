import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/frontend/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/frontend/components/ui/dialog'
import { Input } from '@/frontend/components/ui/input'
import { Field, FieldError, FieldLabel } from '@/ui-registry/field'
import { normalizeQuickAccessUrl } from '@/shared/quick-access'
import type { QuickAccessLink } from '@/shared/types'

type QuickAccessLinkEditorProps = {
  link?: QuickAccessLink
  onSave: (link: Omit<QuickAccessLink, 'id'>) => void
  onClose: () => void
}

export function QuickAccessLinkEditor({ link, onSave, onClose }: QuickAccessLinkEditorProps) {
  const id = useId()
  const [url, setUrl] = useState(link?.url ?? '')
  const [title, setTitle] = useState(link?.title ?? '')
  const [error, setError] = useState<string>()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = normalizeQuickAccessUrl(url)
    if (!normalized) {
      setError('Enter a valid http or https URL')
      return
    }
    onSave({ url: normalized, title: title.trim() || new URL(normalized).hostname })
  }

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{link ? 'Edit link' : 'Add link'}</DialogTitle>
          <DialogDescription>
            Keep a website handy in this workspace. Links open in a new tab.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={`${id}-url`}>URL</FieldLabel>
            <Input
              id={`${id}-url`}
              required
              autoFocus
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://example.com"
              value={url}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={event => {
                setUrl(event.target.value)
                setError(undefined)
              }}
            />
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-title`}>Name (optional)</FieldLabel>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={120}
              placeholder="Project docs"
              onChange={event => setTitle(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{link ? 'Save link' : 'Add link'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
