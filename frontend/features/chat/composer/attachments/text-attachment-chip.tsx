import { LibraryIcon } from '@solar-icons/react/linear'
import { AttachmentChip } from './attachment-chip'

type TextAttachmentChipProps = {
  label: string
  onRemove?: () => void
}

export function TextAttachmentChip({ label, onRemove }: TextAttachmentChipProps) {
  return <AttachmentChip label={label} icon={LibraryIcon} onRemove={onRemove} />
}
