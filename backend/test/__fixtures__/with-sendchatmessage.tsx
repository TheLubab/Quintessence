import { sendChatMessage } from 'quint'
export const config = { title: 'Chase' }
export default function WithChat() {
  return (
    <button onClick={() => sendChatMessage({ message: 'Chase order o-1', attachments: [{ type: 'text', label: 'Order', text: 'o-1' }] })}>Chase order</button>
  )
}
