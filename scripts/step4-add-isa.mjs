import fs from 'node:fs'
import path from 'node:path'
import obj2gltf from 'obj2gltf'

const raw = 'assets/anatomy/raw'
const objDir = path.join(raw, 'isa_BP3D_4.0_obj_99')
const outDir = 'public/anatomy'

const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))
const have = new Set(manifest.map((p) => p.id))

// Read the isa table
const lines = fs
  .readFileSync(path.join(raw, 'isa_element_parts.txt'), 'utf8')
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)

const concepts = new Map()
const fileToConcepts = new Map()
for (const line of lines) {
  const [conceptId, name, fileId] = line.split('\t')
  if (!conceptId || !fileId) continue
  if (!concepts.has(conceptId)) concepts.set(conceptId, { name, files: new Set() })
  concepts.get(conceptId).files.add(fileId)
  if (!fileToConcepts.has(fileId)) fileToConcepts.set(fileId, [])
  fileToConcepts.get(fileId).push(conceptId)
}

// Most specific name per file (fewest files)
const candidates = []
for (const [fileId, ids] of fileToConcepts) {
  if (have.has(fileId)) continue
  ids.sort((a, b) => concepts.get(a).files.size - concepts.get(b).files.size)
  const best = ids[0]
  candidates.push({ id: fileId, conceptId: best, name: concepts.get(best).name })
}

// Keep only muscles for now
const muscleRe =
  /\b(muscle|biceps|triceps|gracilis|sartorius|soleus|gastrocnemius|deltoid|trapezius|pectoralis|latissimus|oblique|masseter|temporalis|brachii|femoris|hallucis|digitorum|pollicis|abdominis|iliopsoas|gluteus|psoas|platysma|buccinator|orbicularis|rectus|levator|tensor|longus|brevis|major|minor|adductor|abductor|flexor|extensor|supinator|pronator|popliteus|tibialis|peroneus|fibularis|serratus|rhomboid|teres|infraspinatus|supraspinatus|subscapularis|semimembranosus|semitendinosus|vastus|gemellus|piriformis|obturator|quadratus|coracobrachialis|anconeus|brachialis|brachioradialis|palmaris|plantaris|lumbrical|interosseous|digastric|mylohyoid|sternocleidomastoid|scalene)\b/

const picked = candidates.filter((p) => muscleRe.test(p.name.toLowerCase()))
console.log('new in isa:', candidates.length, ' muscle-like:', picked.length)

let added = 0
for (const p of picked) {
  const src = path.join(objDir, p.id + '.obj')
  if (!fs.existsSync(src)) continue
  const name = p.name.toLowerCase()
  const side = /\bleft\b/.test(name) ? 'left' : /\bright\b/.test(name) ? 'right' : 'midline'
  try {
    const glb = await obj2gltf(src, { binary: true })
    fs.writeFileSync(path.join(outDir, p.id + '.glb'), glb)
    manifest.push({ ...p, system: 'muscles', side, meshFile: `/anatomy/${p.id}.glb` })
    added++
  } catch (e) {
    console.log('skipped', p.id, e.message)
  }
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log('added', added, 'muscles. manifest total:', manifest.length)
console.log('sample:', picked.slice(0, 10).map((p) => p.name))