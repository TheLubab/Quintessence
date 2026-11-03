import { resolveUrl } from 'quint'
export const videoUrl = resolveUrl('quint:/files/clips/a b.mp4')
export const config = { title: 'Files' }
export default function WithFile() {
  return <video src={videoUrl} />
}
