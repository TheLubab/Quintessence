import { FileIcon } from '@solar-icons/react/linear'
import type { StagedAttachment } from './types'
import { AttachmentChip } from './attachment-chip'

type FileAttachmentChipProps = {
  attachment: Extract<StagedAttachment, { kind: 'file' }>
  onRemove: () => void
}

export function FileAttachmentChip({ attachment, onRemove }: FileAttachmentChipProps) {
  return (
    <AttachmentChip
      label={attachment.label}
      icon={FileIcon}
      onRemove={onRemove}
      previewUrl={attachment.previewUrl}
      loading={attachment.status === 'uploading'}
      title={attachment.label}
      className="max-w-52"
    />
  )
}
