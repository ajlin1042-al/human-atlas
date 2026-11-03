import fs from 'node:fs'
import path from 'node:path'
import obj2gltf from 'obj2gltf'

const objDir = 'assets/anatomy/raw/partof_BP3D_4.0_obj_99'
const outDir = 'public/anatomy'
const LIMIT = 10 // test batch only

fs.mkdirSync(outDir, { recursive: true })

const parts = JSON.parse(fs.readFileSync('assets/anatomy/parts-classified.json', 'utf8'))

// Pick a spread of parts so the test shows different systems
const bySystem = new Map()
for (const p of parts) {
  if (!bySystem.has(p.system)) bySystem.set(p.system, [])
  bySystem.get(p.system).push(p)
}
const picked = []
let i = 0
while (picked.length < LIMIT) {
  let added = false
  for (const list of bySystem.values()) {
    if (list[i] && picked.length < LIMIT) {
      picked.push(list[i])
      added = true
    }
  }
  if (!added) break
  i++
}

const manifest = []
for (const p of picked) {
  const src = path.join(objDir, p.id + '.obj')
  const glb = await obj2gltf(src, { binary: true })
  fs.writeFileSync(path.join(outDir, p.id + '.glb'), glb)
  manifest.push({ ...p, meshFile: `/anatomy/${p.id}.glb` })
  console.log('converted', p.id, p.name, `(${p.system})`)
}

fs.writeFileSync(path.join(outDir, 'manifest-test.json'), JSON.stringify(manifest, null, 2))
console.log('done:', manifest.length, 'parts')