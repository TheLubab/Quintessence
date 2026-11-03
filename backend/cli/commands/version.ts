import { defineCommand } from 'citty'
import { versionWithCommit } from '../../version'

export const version = defineCommand({
  meta: { name: 'version', description: 'Print the Quint version' },
  run() {
    console.log(versionWithCommit())
  }
})
