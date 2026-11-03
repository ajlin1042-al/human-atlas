import fs from 'node:fs'
import path from 'node:path'

const raw = 'assets/anatomy/raw'
const objDir = path.join(raw, 'partof_BP3D_4.0_obj_99')

// Read the table (skip the header line)
const lines = fs
  .readFileSync(path.join(raw, 'partof_element_parts.txt'), 'utf8')
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)

const concepts = new Map() // conceptId -> { name, files: Set }
const fileToConcepts = new Map() // fileId -> [conceptId, ...]

for (const line of lines) {
  const [conceptId, name, fileId] = line.split('\t')
  if (!conceptId || !fileId) continue
  if (!concepts.has(conceptId)) concepts.set(conceptId, { name, files: new Set() })
  concepts.get(conceptId).files.add(fileId)
  if (!fileToConcepts.has(fileId)) fileToConcepts.set(fileId, [])
  fileToConcepts.get(fileId).push(conceptId)
}

// Assign each file to its most specific concept (fewest files)
const parts = []
for (const [fileId, ids] of fileToConcepts) {
  ids.sort((a, b) => concepts.get(a).files.size - concepts.get(b).files.size)
  const best = ids[0]
  parts.push({ id: fileId, conceptId: best, name: concepts.get(best).name })
}

// Compare against the real .obj files on disk
const objFiles = fs.readdirSync(objDir).filter((f) => f.endsWith('.obj'))
const objIds = new Set(objFiles.map((f) => f.replace('.obj', '')))
const matched = parts.filter((p) => objIds.has(p.id))
const missingObj = parts.filter((p) => !objIds.has(p.id))
const noName = [...objIds].filter((id) => !fileToConcepts.has(id))

fs.writeFileSync('assets/anatomy/parts-draft.json', JSON.stringify(matched, null, 2))

console.log('obj files on disk:      ', objFiles.length)
console.log('named parts in table:   ', parts.length)
console.log('matched (obj + name):   ', matched.length)
console.log('in table, no obj file:  ', missingObj.length)
console.log('obj file, no name:      ', noName.length)
console.log('sample:', matched.slice(0, 8))