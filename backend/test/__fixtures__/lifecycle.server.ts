let disposePath: string | undefined
export async function pid() { return process.pid }
export async function hang() { return new Promise(() => {}) }
export async function crash() { process.exit(23) }
export async function setDisposePath(path: string) { disposePath = path }
export async function dispose() {
  if (disposePath) await Bun.write(disposePath, 'disposed')
}
