import { navigate } from 'quint'
export const config = { title: 'Focus' }
export default function WithFocus() {
  return <button onClick={() => navigate('quint:/quintlets/orders?order=o-1')}>Open order</button>
}
