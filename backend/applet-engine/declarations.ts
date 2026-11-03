import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const BASE_DECLARATION_SOURCE_PATH = join(import.meta.dir, 'declarations', 'base.d.ts')

export type AppletDeclarationFile = 'base.d.ts'

export function appletDeclarationPath(workspacePath: string, file: AppletDeclarationFile): string {
  return join(workspacePath, '.quint', file)
}

async function writeDeclaration(
  workspacePath: string,
  file: AppletDeclarationFile
): Promise<boolean> {
  const sourcePath = join(import.meta.dir, 'declarations', file)
  const targetPath = appletDeclarationPath(workspacePath, file)
  const contents = await Bun.file(sourcePath).text()
  const target = Bun.file(targetPath)
  if ((await target.exists()) && (await target.text()) === contents) return false
  await mkdir(dirname(targetPath), { recursive: true })
  await Bun.write(targetPath, contents)
  return true
}

export async function syncAppletDeclarations(
  workspacePath: string
): Promise<AppletDeclarationFile[]> {
  const quintDir = join(workspacePath, '.quint')
  if (!(await stat(quintDir).catch(() => null))?.isDirectory()) return []

  const updated: AppletDeclarationFile[] = []
  if (await writeDeclaration(workspacePath, 'base.d.ts')) updated.push('base.d.ts')

  return updated
}
