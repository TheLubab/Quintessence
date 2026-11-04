export class MetaSessionResumeError extends Error {
  constructor(cause: Error) {
    const detail = /target sequence.*incomplete|session log cannot be read/i.test(cause.message)
      ? 'its saved log is incomplete or unreadable'
      : 'Muse Code refused to resume its saved session'
    super(
      `Could not reopen this chat: ${detail}. Start a new chat to continue, or repair or restore the original session in Muse Code. The saved chat has not been changed.`,
      { cause }
    )
    this.name = 'MetaSessionResumeError'
  }
}
