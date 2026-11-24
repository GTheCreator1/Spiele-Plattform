import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = new URL('../dist/', import.meta.url)
const distPath = fileURLToPath(dist)
const assets = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name !== 'sw.js')
  .map((entry) => relative(distPath, join(entry.parentPath, entry.name)).split(sep).map(encodeURIComponent).join('/'))
  .sort()

const template = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8')
const version = createHash('sha256').update(template)
for (const asset of assets) {
  version.update(asset).update(await readFile(new URL(asset, dist)))
}

const setup = `const build = ${JSON.stringify(version.digest('hex').slice(0, 16))}\nconst assets = ${JSON.stringify(assets)}\n`
await writeFile(new URL('sw.js', dist), setup + template)
