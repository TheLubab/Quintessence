// One-time instructions when a chat starts working on a pending quintlet.
// The quint-workspace skill owns the general build workflow.
export function quintletBuildDirectives(quintletId: string, availableIcons: readonly string[]): string[] {
  return [
    'Build a new quintlet from this message. Follow the pending quintlet steps in the quint-workspace skill.',
    `The quintlet id is \`${quintletId}\`. Write the quintlet source to \`.quint/quintlets/${quintletId}.tsx\`.`,
    `Before building, set a provisional title and icon: \`quint quintlets set ${quintletId} --title "<title>" --icon <icon-id>\`. Use sentence case for the title.`,
    `Available quintlet icons: ${availableIcons.join(', ')}`,
    'If the user asks for an additional quintlet, create it with: `quint quintlets create --requirements "<complete requirements>"`.',
    `When done, do not navigate. Keep the user's current tab open and end your reply with \`[Open the quintlet](quint:/quintlets/${quintletId})\`.`
  ]
}
