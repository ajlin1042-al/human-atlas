import fs from 'node:fs'

const parts = JSON.parse(fs.readFileSync('assets/anatomy/parts-draft.json', 'utf8'))

// Order matters: first match wins.
const rules = [
  ['heart', /\b(heart|atrium|atrial|ventricle|ventricular|coronary|cardiac|mitral|tricuspid|aortic valve|pulmonary valve|papillary|chordae|auricle of)\b/],
  ['respiratory', /\b(lung|bronch\w*|trachea|larynx|laryngeal|pleura|epiglottis|nasal cavity|diaphragm|pulmonary lobe)\b/],
  ['sensory organs', /\b(eye|eyeball|cornea|lens|retina|iris|sclera|optic|ear|cochlea|tympanic|ossicle|semicircular|tongue|nose|eyelid|lacrimal|vestibul\w*)\b/],
  ['nervous system', /\b(nerve|brain|cerebr\w*|cerebell\w*|spinal cord|ganglion|plexus|gyrus|thalamus|medulla|pons|midbrain|hypothalam\w*|hippocamp\w*|sulcus|fornix|corpus callosum|nucleus|tract)\b/],
  ['arteries', /\b(artery|arteries|arterial|aorta|aortic arch|arteriole|trunk|costocervical|thyrocervical)\b/],
  ['veins', /\b(vein|venous|vena cava|sinus of dura|venule)\b/],
  ['muscles', /\b(muscle|muscular|biceps|triceps|gracilis|sartorius|soleus|gastrocnemius|deltoid|trapezius|pectoralis|latissimus|oblique|masseter|temporalis|sphincter|tendon|brachii|femoris|hallucis|digitorum|pollicis|abdominis|iliopsoas|gluteus|psoas|platysma|buccinator|orbicularis|levator|tensor|veli palatini|rectus)\b/],
  ['skeleton', /\b(bone|vertebra|rib|sternum|skull|cranium|mandible|maxilla|jaw|femur|tibia|fibula|humerus|radius|ulna|scapula|clavicle|patella|sacrum|coccyx|phalanx|metacarpal|metatarsal|carpal|tarsal|talus|calcaneus|pelvis|ilium|ischium|pubis|hyoid|cartilage|ligament|disc|condyle|epicondyle|malleolus|trochanter)\b/],
  ['other organs', /\b(esophagus|stomach|pancreas|pancreatic|appendix|colon|intestine|duodenum|jejunum|ileum|rectum|liver|hepatic|biliary|gallbladder|spleen|kidney|renal|ureter|bladder|gingiva|tooth|teeth|thyroid|gland|tonsil|pharynx|uterus|ovary|prostate|segment|lobe|taenia|ileocecal|duct|junction|meso\w*|choroid)\b/],
]

const out = []
const unclassified = []
for (const p of parts) {
  const name = p.name.toLowerCase()
  const hit = rules.find(([, re]) => re.test(name))
  if (!hit) {
    unclassified.push(p)
    continue
  }
  const side = /\bleft\b/.test(name) ? 'left' : /\bright\b/.test(name) ? 'right' : 'midline'
  out.push({ ...p, system: hit[0], side })
}

fs.writeFileSync('assets/anatomy/parts-classified.json', JSON.stringify(out, null, 2))
fs.writeFileSync(
  'assets/anatomy/unclassified.log',
  unclassified.map((p) => `${p.id}\t${p.name}`).join('\n')
)

const counts = {}
for (const p of out) counts[p.system] = (counts[p.system] || 0) + 1
console.log('classified:  ', out.length)
console.log('unclassified:', unclassified.length)
console.table(counts)
console.log('first unclassified:', unclassified.slice(0, 15).map((p) => p.name))