import {
  Component,
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { NOTES } from './notes'

type Part = {
  id: string
  name: string
  system: string
  meshFile: string
}

type Focus = { id: string | null; ids?: string[]; nonce: number }
type Registry = MutableRefObject<Map<string, THREE.Object3D>>
type Side = 'both' | 'left' | 'right'
type Tool = 'orbit' | 'pan'
type CamCmd = 'in' | 'out' | 'front'
type CommandRef = MutableRefObject<((cmd: CamCmd) => void) | null>

const SYSTEMS = [
  'skeleton',
  'muscles',
  'heart',
  'sensory organs',
  'arteries',
  'veins',
  'nervous system',
  'respiratory',
  'other organs',
]

const ORGAN_SYSTEMS = ['heart', 'sensory organs', 'respiratory', 'other organs']

const COLORS: Record<string, string> = {
  arteries: '#c0504d',
  veins: '#4f6fa8',
  heart: '#b03a48',
  skeleton: '#e4dfd2',
  muscles: '#b8715a',
  'nervous system': '#d9b84a',
  'sensory organs': '#7aa874',
  respiratory: '#8fb4c9',
  'other organs': '#a58a6e',
}

const CATEGORY: Record<string, string> = {
  skeleton: 'Bone',
  muscles: 'Muscle',
  heart: 'Heart',
  'sensory organs': 'Sensory organ',
  arteries: 'Artery',
  veins: 'Vein',
  'nervous system': 'Nerve',
  respiratory: 'Respiratory',
  'other organs': 'Organ',
}

/* ---------- Regions (worked out from piece names) ---------- */
const REGIONS = ['Hand', 'Shoulder', 'Thigh', 'Foot', 'Heart', 'Brain']

const FOOT_RE = /foot|toe|tarsal|calcane|talus|navicular|cuboid|cuneiform|plantar|hallucis/
const HAND_RE = /hand|finger|thumb|carpal|lumbrical|phalanx|pollicis|digiti minimi|scaphoid|lunate|triquetr|pisiform|trapezi|hamate|capitate/
const SHOULDER_RE = /scapula|clavicle|deltoid|supraspinatus|infraspinatus|subscapularis|teres major|teres minor|shoulder|acromi|glenohumeral|coracobrachialis|coracoid/
const THIGH_RE = /femur|femoris|vastus|gracilis|sartorius|semitendinosus|semimembranosus|adductor magnus|adductor longus|adductor brevis|pectineus|thigh|tensor fasciae latae|iliotibial|patella/
const BRAIN_RE = /brain|cerebr|cerebell|gyrus|lobe|thalam|hippocamp|pons|medulla|midbrain|callosum|caudate|putamen|pallid|hypothalam|amygdal|sulcus|cortex/

function matchRegion(region: string, p: Part): boolean {
  const n = p.name.toLowerCase()
  switch (region) {
    case 'Foot':
      return FOOT_RE.test(n)
    case 'Hand':
      return HAND_RE.test(n) && !FOOT_RE.test(n)
    case 'Shoulder':
      return SHOULDER_RE.test(n)
    case 'Thigh':
      return THIGH_RE.test(n)
    case 'Heart':
      return p.system === 'heart'
    case 'Brain':
      return p.system === 'nervous system' && BRAIN_RE.test(n)
    default:
      return false
  }
}

function sideOk(side: Side, p: Part): boolean {
  if (side === 'both') return true
  const n = p.name.toLowerCase()
  const isLeft = /\bleft\b/.test(n)
  const isRight = /\bright\b/.test(n)
  // midline pieces (no left/right in the name) show for both sides
  return side === 'left' ? !isRight : !isLeft
}

function regionPieces(parts: Part[], region: string, side: Side): Part[] {
  return parts.filter((p) => matchRegion(region, p) && sideOk(side, p))
}

/* Facts for the bubble, taken only from the piece's own data */
function sideOf(p: Part): string {
  const n = p.name.toLowerCase()
  if (/\bleft\b/.test(n)) return 'Left'
  if (/\bright\b/.test(n)) return 'Right'
  return 'Midline'
}

function regionOf(p: Part): string | null {
  return REGIONS.find((r) => matchRegion(r, p)) ?? null
}

const HOME_POS = new THREE.Vector3(0, 1.1, 4)
const HOME_TARGET = new THREE.Vector3(0, 1, 0)

// atlas layout settings (world units, roughly metres)
const ATLAS_WIDTH = 18
const ATLAS_GAP = 0.03
const ATLAS_TOP = 2.4
const GROUP_SCALE = 0.001

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: Error) {
    console.warn('Piece failed to load:', e.message)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/* Smooth camera moves: fly to a piece/group/home, zoom, front view, and orbit/pan mode. */
function CameraRig({
  focus,
  registry,
  commandRef,
  tool,
}: {
  focus: Focus
  registry: Registry
  commandRef: CommandRef
  tool: Tool
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as any
  const tween = useRef<any>(null)

  // orbit mode vs pan mode: what the left mouse button / one finger does
  useEffect(() => {
    if (!controls) return
    controls.mouseButtons = {
      LEFT: tool === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    controls.touches = {
      ONE: tool === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    }
  }, [controls, tool])

  // toolbar commands: zoom in, zoom out, front view
  useEffect(() => {
    commandRef.current = (cmd: CamCmd) => {
      if (!controls) return
      const target = controls.target.clone() as THREE.Vector3
      const offset = camera.position.clone().sub(target)
      const dist = offset.length()
      let endPos: THREE.Vector3
      if (cmd === 'in') endPos = target.clone().add(offset.multiplyScalar(0.65))
      else if (cmd === 'out') endPos = target.clone().add(offset.multiplyScalar(1.5))
      else endPos = target.clone().add(new THREE.Vector3(0, 0, dist))
      tween.current = {
        t: 0,
        fromPos: camera.position.clone(),
        fromTarget: target.clone(),
        endPos,
        endTarget: target,
      }
    }
  }, [camera, controls, commandRef])

  useEffect(() => {
    if (!controls || focus.nonce === 0) return
    let endPos: THREE.Vector3
    let endTarget: THREE.Vector3

    if (focus.ids) {
      const box = new THREE.Box3()
      for (const id of focus.ids) {
        const obj = registry.current.get(id)
        if (obj) box.union(new THREE.Box3().setFromObject(obj))
      }
      if (box.isEmpty()) return
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const fovRad = (camera.fov * Math.PI) / 180
      const dist = Math.max((maxDim / (2 * Math.tan(fovRad / 2))) * 1.6, 0.3)
      const dir = new THREE.Vector3(0, 0.1, 1).normalize()
      endTarget = center
      endPos = center.clone().add(dir.multiplyScalar(dist))
    } else if (focus.id === null) {
      endPos = HOME_POS.clone()
      endTarget = HOME_TARGET.clone()
    } else {
      const obj = registry.current.get(focus.id)
      if (!obj) return
      const box = new THREE.Box3().setFromObject(obj)
      if (box.isEmpty()) return
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const fovRad = (camera.fov * Math.PI) / 180
      const dist = Math.max((maxDim / (2 * Math.tan(fovRad / 2))) * 2, 0.25)
      const dir = camera.position.clone().sub(controls.target).normalize()
      endTarget = center
      endPos = center.clone().add(dir.multiplyScalar(dist))
    }

    tween.current = {
      t: 0,
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      endPos,
      endTarget,
    }
  }, [focus, camera, controls, registry])

  useFrame((_, dt) => {
    const tw = tween.current
    if (!tw || !controls) return
    tw.t = Math.min(1, tw.t + dt / 0.9)
    const k = easeInOutCubic(tw.t)
    camera.position.lerpVectors(tw.fromPos, tw.endPos, k)
    controls.target.lerpVectors(tw.fromTarget, tw.endTarget, k)
    controls.update()
    if (tw.t >= 1) tween.current = null
  })

  return null
}

type Layout = {
  offsets: Map<string, THREE.Vector3>
  camPos: THREE.Vector3
  camTarget: THREE.Vector3
}

/* Explode: moves every piece between the body and the atlas, and pulls the camera back. */
function ExplodeRig({
  explodeRef,
  registry,
}: {
  explodeRef: MutableRefObject<number>
  registry: Registry
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as any
  const current = useRef(0)
  const applied = useRef(-1)
  const layout = useRef<Layout | null>(null)
  const layoutSize = useRef(0)
  const layoutTime = useRef(0)

  const buildLayout = () => {
    const items: { id: string; center: THREE.Vector3; w: number; h: number }[] = []

    registry.current.forEach((obj, id) => {
      if (!obj.userData.base) obj.userData.base = obj.position.clone()
      obj.position.copy(obj.userData.base)
      const box = new THREE.Box3().setFromObject(obj)
      if (box.isEmpty()) return
      const size = box.getSize(new THREE.Vector3())
      items.push({ id, center: box.getCenter(new THREE.Vector3()), w: size.x, h: size.y })
    })

    items.sort((a, b) => b.h - a.h)

    const rows: (typeof items)[] = []
    let row: typeof items = []
    let rowWidth = 0
    for (const it of items) {
      const cw = it.w + ATLAS_GAP
      if (rowWidth + cw > ATLAS_WIDTH && row.length > 0) {
        rows.push(row)
        row = []
        rowWidth = 0
      }
      row.push(it)
      rowWidth += cw
    }
    if (row.length) rows.push(row)

    const offsets = new Map<string, THREE.Vector3>()
    let top = ATLAS_TOP
    let maxRight = -ATLAS_WIDTH / 2
    for (const r of rows) {
      const rowH = r[0].h + ATLAS_GAP
      const cy = top - rowH / 2
      let x = -ATLAS_WIDTH / 2
      for (const it of r) {
        const cx = x + it.w / 2
        const dx = cx - it.center.x
        const dy = cy - it.center.y
        const dz = 0 - it.center.z
        offsets.set(
          it.id,
          new THREE.Vector3(dx / GROUP_SCALE, -dz / GROUP_SCALE, dy / GROUP_SCALE)
        )
        x += it.w + ATLAS_GAP
      }
      maxRight = Math.max(maxRight, x)
      top -= rowH + ATLAS_GAP
    }

    const width = maxRight + ATLAS_WIDTH / 2
    const height = ATLAS_TOP - top
    const cx = (maxRight - ATLAS_WIDTH / 2) / 2
    const cy = (ATLAS_TOP + top) / 2
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360)
    const dist =
      Math.max(height / (2 * tanHalf), width / (2 * tanHalf * camera.aspect)) * 1.08

    layout.current = {
      offsets,
      camPos: new THREE.Vector3(cx, cy, dist),
      camTarget: new THREE.Vector3(cx, cy, 0),
    }
    layoutSize.current = registry.current.size
    layoutTime.current = performance.now()
    applied.current = -1
  }

  useFrame((_, dt) => {
    const target = explodeRef.current
    current.current += (target - current.current) * (1 - Math.exp(-dt * 5))
    if (Math.abs(target - current.current) < 0.0005) current.current = target
    const v = current.current

    if (target > 0 || v > 0) {
      const stale =
        registry.current.size !== layoutSize.current &&
        performance.now() - layoutTime.current > 1500
      if (!layout.current || stale) buildLayout()
    }

    const L = layout.current
    if (!L || v === applied.current) return
    applied.current = v

    const k = easeInOutCubic(v)
    registry.current.forEach((obj, id) => {
      const off = L.offsets.get(id)
      const base = obj.userData.base
      if (!off || !base) return
      obj.position.set(base.x + off.x * k, base.y + off.y * k, base.z + off.z * k)
    })

    if (controls) {
      camera.position.lerpVectors(HOME_POS, L.camPos, k)
      controls.target.lerpVectors(HOME_TARGET, L.camTarget, k)
      controls.update()
    }
  })

  return null
}

/* Keeps the info bubble beside the isolated piece (never on top of it).
   Runs in the render loop and moves the bubble with direct style updates,
   so React state is not touched every frame. */
function BubbleTracker({
  id,
  registry,
  bubbleRef,
  lineRef,
}: {
  id: string
  registry: Registry
  bubbleRef: { current: HTMLDivElement | null }
  lineRef: { current: SVGLineElement | null }
}) {
  const box = useRef(new THREE.Box3())
  const v = useRef(new THREE.Vector3())

  useFrame((state) => {
    const el = bubbleRef.current
    const line = lineRef.current
    if (!el || !line) return
    const obj = registry.current.get(id)
    if (!obj) return
    box.current.setFromObject(obj)
    if (box.current.isEmpty()) return

    const { min, max } = box.current
    const W = state.size.width
    const H = state.size.height

    // project the 8 corners of the piece's bounding box to the screen
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < 8; i++) {
      v.current.set(
        i & 1 ? max.x : min.x,
        i & 2 ? max.y : min.y,
        i & 4 ? max.z : min.z
      )
      v.current.project(state.camera)
      const sx = (v.current.x * 0.5 + 0.5) * W
      const sy = (-v.current.y * 0.5 + 0.5) * H
      minX = Math.min(minX, sx)
      maxX = Math.max(maxX, sx)
      minY = Math.min(minY, sy)
      maxY = Math.max(maxY, sy)
    }

    const w = el.offsetWidth
    const h = el.offsetHeight
    const gap = 28
    const cy = (minY + maxY) / 2

    // free space on each side (the left column and the right info panel take room)
    const spaceRight = W - 360 - maxX
    const spaceLeft = minX - 220
    const placeRight = spaceRight >= w + gap || spaceRight >= spaceLeft

    const bx = placeRight ? maxX + gap : minX - gap - w
    const by = Math.max(80, Math.min(H - h - 80, cy - h / 2))

    el.style.transform = `translate(${bx}px, ${by}px)`
    el.style.opacity = '1'

    // thin connector from the piece edge to the bubble edge
    line.setAttribute('x1', String(placeRight ? maxX : minX))
    line.setAttribute('y1', String(cy))
    line.setAttribute('x2', String(placeRight ? bx : bx + w))
    line.setAttribute('y2', String(by + h / 2))
  })

  return null
}

type PartMeshProps = {
  part: Part
  visible: boolean
  selected: boolean
  dim: boolean
  registry: Registry
  onHover: (p: Part | null) => void
  onSelect: (p: Part | null) => void
}

const PartMesh = memo(function PartMesh({
  part,
  visible,
  selected,
  dim,
  registry,
  onHover,
  onSelect,
}: PartMeshProps) {
  const { scene } = useGLTF(part.meshFile)
  const [hovered, setHovered] = useState(false)

  const cloned = useMemo(() => {
    const c = scene.clone()
    c.traverse((o: any) => {
      if (o.isMesh) {
        o.material = o.material.clone()
        o.material.color.set(COLORS[part.system] ?? '#cccccc')
      }
    })
    return c
  }, [scene, part.system])

  useEffect(() => {
    registry.current.set(part.id, cloned)
    return () => {
      registry.current.delete(part.id)
    }
  }, [cloned, part.id, registry])

  useEffect(() => {
    cloned.traverse((o: any) => {
      if (o.isMesh) {
        const m = o.material
        if (m.emissive) {
          m.emissive.set(selected ? '#3a5a6a' : hovered ? '#2a3a44' : '#000000')
        }
        m.transparent = dim
        m.opacity = dim ? 0.12 : 1
        m.depthWrite = !dim
        m.needsUpdate = true
      }
    })
  }, [cloned, hovered, selected, dim])

  return (
    <primitive
      object={cloned}
      visible={visible}
      onPointerOver={(e: any) => {
        if (!visible) return
        e.stopPropagation()
        setHovered(true)
        onHover(part)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover(null)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e: any) => {
        if (!visible) return
        e.stopPropagation()
        onSelect(part)
      }}
    />
  )
})

const card: React.CSSProperties = {
  background: '#fcfcfb',
  border: '1px solid rgba(0,0,0,0.05)',
  borderRadius: 12,
  boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
  fontSize: 12,
  color: '#13242D',
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 26,
        height: 15,
        borderRadius: 8,
        background: on ? '#13242D' : '#d6d6d3',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 200ms',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 13 : 2,
          width: 11,
          height: 11,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 200ms',
        }}
      />
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '7px 0',
        borderTop: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <span style={{ color: '#8a8f93' }}>{label}</span>
      <span style={{ textTransform: 'capitalize' }}>{value}</span>
    </div>
  )
}

function ToolButton({
  label,
  title,
  active,
  onClick,
}: {
  label: string
  title: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 15,
        background: active ? '#13242D' : 'transparent',
        color: active ? '#fff' : '#13242D',
        transition: 'background 150ms',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = '#efefec'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      {label}
    </button>
  )
}

export default function App() {
  const [parts, setParts] = useState<Part[]>([])
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(SYSTEMS.map((s) => [s, true]))
  )
  const [hovered, setHovered] = useState<Part | null>(null)
  const [selected, setSelected] = useState<Part | null>(null)
  const [isolated, setIsolated] = useState(false)
  const [focus, setFocus] = useState<Focus>({ id: null, nonce: 0 })
  const [showCredits, setShowCredits] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [explode, setExplode] = useState(0)
  const [region, setRegion] = useState<string | null>(null)
  const [side, setSide] = useState<Side>('both')
  const [collectionsOpen, setCollectionsOpen] = useState(true)
  const [systemsOpen, setSystemsOpen] = useState(true)
  const [tool, setTool] = useState<Tool>('orbit')
  const [fullscreen, setFullscreen] = useState(false)
  const explodeRef = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<SVGLineElement>(null)
  const commandRef = useRef<((cmd: CamCmd) => void) | null>(null)
  const registry = useRef<Map<string, THREE.Object3D>>(new Map())
  const { loaded, total } = useProgress()

  const changeExplode = (v: number) => {
    setExplode(v)
    explodeRef.current = v
  }

  useEffect(() => {
    fetch('/anatomy/manifest.json')
      .then((r) => r.json())
      .then(setParts)
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
      }
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])

  // keep the fullscreen button in sync (also when the user presses Esc)
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }

  const select = useCallback((p: Part | null) => {
    setSelected(p)
    if (p) setFocus((f) => ({ id: p.id, nonce: f.nonce + 1 }))
    else setIsolated(false)
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return parts.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [query, parts])

  const pickResult = (p: Part) => {
    setRegion(null)
    setOn((o) => ({ ...o, [p.system]: true }))
    setIsolated(false)
    select(p)
    setQuery('')
    setSearchOpen(false)
    searchRef.current?.blur()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if ((e.key === 'f' || e.key === 'F') && !typing && !e.ctrlKey && !e.metaKey) {
        commandRef.current?.('front')
      }
      if (e.key === 'Escape') {
        setQuery('')
        setSearchOpen(false)
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ---------- Regions ---------- */
  const regionCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of REGIONS) c[r] = regionPieces(parts, r, side).length
    return c
  }, [parts, side])

  const regionIds = useMemo(() => {
    if (!region) return null
    return new Set(regionPieces(parts, region, side).map((p) => p.id))
  }, [parts, region, side])

  const frameRegion = (r: string, s: Side) => {
    const ids = regionPieces(parts, r, s).map((p) => p.id)
    if (ids.length === 0) return
    const go = () => setFocus((f) => ({ id: null, ids, nonce: f.nonce + 1 }))
    if (explodeRef.current > 0.02) {
      changeExplode(0)
      setTimeout(go, 1100) // wait for the body to come back together
    } else {
      go()
    }
  }

  const goHome = () => setFocus((f) => ({ id: null, nonce: f.nonce + 1 }))

  const chooseRegion = (r: string) => {
    setSelected(null)
    setIsolated(false)
    if (region === r) {
      setRegion(null)
      goHome()
      return
    }
    setRegion(r)
    frameRegion(r, side)
  }

  const chooseSide = (s: Side) => {
    setSide(s)
    if (region) frameRegion(region, s)
  }

  const resetView = () => {
    setSelected(null)
    setIsolated(false)
    setRegion(null)
    changeExplode(0)
    goHome()
  }

  /* ---------- Systems presets ---------- */
  const preset = (name: 'all' | 'skeleton' | 'organs') => {
    setRegion(null)
    setOn(
      Object.fromEntries(
        SYSTEMS.map((s) => [
          s,
          name === 'all'
            ? true
            : name === 'skeleton'
              ? s === 'skeleton'
              : ORGAN_SYSTEMS.includes(s),
        ])
      )
    )
  }

  const activePreset = (() => {
    const onList = SYSTEMS.filter((s) => on[s])
    if (onList.length === SYSTEMS.length) return 'all'
    if (onList.length === 1 && onList[0] === 'skeleton') return 'skeleton'
    if (
      onList.length === ORGAN_SYSTEMS.length &&
      ORGAN_SYSTEMS.every((s) => on[s])
    )
      return 'organs'
    return null
  })()

  const onCount = SYSTEMS.filter((s) => on[s]).length

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of parts) c[p.system] = (c[p.system] || 0) + 1
    return c
  }, [parts])

  const visibleCount = regionIds
    ? regionIds.size
    : parts.filter((p) => on[p.system]).length
  const setAll = (v: boolean) =>
    setOn(Object.fromEntries(SYSTEMS.map((s) => [s, v])))

  const showBubble = selected !== null && isolated
  const bubbleRegion = selected ? regionOf(selected) : null
  const bubbleNote = selected ? NOTES[selected.id] : undefined

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#F3F3F1' }}>
      <Canvas
        camera={{ position: [0, 1.1, 4], fov: 40 }}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={['#F3F3F1']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 4]} intensity={0.8} />
        <group scale={GROUP_SCALE} rotation={[-Math.PI / 2, 0, 0]}>
          {parts.map((p) => {
            const isSel = selected?.id === p.id
            // a chosen region overrides the system toggles
            const base = regionIds ? regionIds.has(p.id) : !!on[p.system]
            return (
              <Boundary key={p.id}>
                <Suspense fallback={null}>
                  <PartMesh
                    part={p}
                    visible={base && (!isolated || isSel)}
                    selected={isSel}
                    dim={selected !== null && !isSel}
                    registry={registry}
                    onHover={setHovered}
                    onSelect={select}
                  />
                </Suspense>
              </Boundary>
            )
          })}
        </group>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          target={[0, 1, 0]}
        />
        <ExplodeRig explodeRef={explodeRef} registry={registry} />
        <CameraRig
          focus={focus}
          registry={registry}
          commandRef={commandRef}
          tool={tool}
        />
        {showBubble && selected && (
          <BubbleTracker
            id={selected.id}
            registry={registry}
            bubbleRef={bubbleRef}
            lineRef={lineRef}
          />
        )}
      </Canvas>

      {/* Info bubble (only while a structure is isolated) */}
      {showBubble && selected && (
        <>
          <svg
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 4,
            }}
          >
            <line
              ref={lineRef}
              stroke="#13242D"
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          </svg>
          <div
            ref={bubbleRef}
            style={{
              ...card,
              position: 'absolute',
              left: 0,
              top: 0,
              width: 220,
              padding: 12,
              pointerEvents: 'none',
              opacity: 0,
              zIndex: 5,
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#8a8f93' }}>
              {(CATEGORY[selected.system] ?? 'Structure').toUpperCase()}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, margin: '4px 0 8px' }}>
              {selected.name}
            </div>
            <div style={{ color: '#8a8f93', fontSize: 11 }}>
              Side: <span style={{ color: '#13242D' }}>{sideOf(selected)}</span>
              {bubbleRegion && (
                <>
                  {' · '}Region: <span style={{ color: '#13242D' }}>{bubbleRegion}</span>
                </>
              )}
            </div>
            {bubbleNote && (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid rgba(0,0,0,0.06)',
                  fontSize: 11,
                }}
              >
                {bubbleNote}
              </div>
            )}
          </div>
        </>
      )}

      {/* Branding */}
      <div style={{ position: 'absolute', left: 24, top: 24, color: '#13242D' }}>
        <div style={{ fontSize: 10, letterSpacing: 2.2, color: '#8a8f93' }}>
          INTERACTIVE ANATOMY
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, marginTop: 2 }}>
          Human Atlas
          <sup style={{ fontSize: 11, marginLeft: 3, fontWeight: 500 }}>3D</sup>
        </div>
        <div style={{ fontSize: 11, color: '#8a8f93', marginTop: 2 }}>
          {parts.length} modeled pieces · BodyParts3D
        </div>
      </div>

      {/* Reset view */}
      <button
        onClick={resetView}
        style={{
          ...card,
          position: 'absolute',
          right: 24,
          top: 70,
          padding: '8px 14px',
          cursor: 'pointer',
        }}
      >
        Reset view
      </button>

      {/* Search */}
      <div style={{ position: 'absolute', right: 24, top: 24, width: 240 }}>
        <div
          style={{
            ...card,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
          }}
        >
          <span style={{ color: '#8a8f93' }}>⌕</span>
          <input
            ref={searchRef}
            value={query}
            placeholder="Find a structure"
            onChange={(e) => {
              setQuery(e.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) pickResult(results[0])
            }}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 12,
              color: '#13242D',
              minWidth: 0,
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: '#8a8f93',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 4,
              padding: '0 5px',
            }}
          >
            /
          </span>
        </div>
        {searchOpen && results.length > 0 && (
          <div style={{ ...card, marginTop: 6, padding: 4 }}>
            {results.map((p) => (
              <div
                key={p.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickResult(p)
                }}
                style={{ padding: '7px 10px', cursor: 'pointer', borderRadius: 8 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0ee')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#8a8f93' }}>
                  {CATEGORY[p.system] ?? 'Structure'}
                </div>
              </div>
            ))}
          </div>
        )}
        {searchOpen && query.trim() !== '' && results.length === 0 && (
          <div style={{ ...card, marginTop: 6, padding: '10px 12px', color: '#8a8f93' }}>
            No matches
          </div>
        )}
      </div>

      {/* Camera toolbar (right edge, vertically centered) */}
      <div
        style={{
          ...card,
          position: 'absolute',
          right: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          padding: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          zIndex: 5,
        }}
      >
        <ToolButton label="+" title="Zoom in" onClick={() => commandRef.current?.('in')} />
        <ToolButton label="F" title="Front view (F)" onClick={() => commandRef.current?.('front')} />
        <ToolButton label="−" title="Zoom out" onClick={() => commandRef.current?.('out')} />
        <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '2px 4px' }} />
        <ToolButton label="⟳" title="Orbit mode" active={tool === 'orbit'} onClick={() => setTool('orbit')} />
        <ToolButton label="✥" title="Pan mode" active={tool === 'pan'} onClick={() => setTool('pan')} />
        <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '2px 4px' }} />
        <ToolButton label="↺" title="Reset camera" onClick={resetView} />
        <ToolButton
          label={fullscreen ? '✕' : '⛶'}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          active={fullscreen}
          onClick={toggleFullscreen}
        />
      </div>

      {/* Left column: Systems + Specimen collections */}
      <div
        style={{
          position: 'absolute',
          left: 24,
          top: 140,
          width: 190,
          maxHeight: 'calc(100vh - 170px)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          scrollbarWidth: 'none',
        }}
      >
        {/* Systems panel */}
        <div style={{ ...card, padding: 12, flexShrink: 0 }}>
          <div
            onClick={() => setSystemsOpen(!systemsOpen)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              marginBottom: systemsOpen ? 8 : 0,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Systems</span>
              <span
                style={{
                  fontSize: 10,
                  color: '#8a8f93',
                  background: '#efefec',
                  borderRadius: 6,
                  padding: '1px 6px',
                }}
              >
                {onCount}/{SYSTEMS.length}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!systemsOpen && (
                <span style={{ color: '#8a8f93', fontSize: 11 }}>{visibleCount} visible</span>
              )}
              <span
                style={{
                  color: '#8a8f93',
                  display: 'inline-block',
                  transition: 'transform 200ms',
                  transform: systemsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
              >
                ▾
              </span>
            </span>
          </div>
          {systemsOpen && (
            <>
              {/* presets */}
              <div
                style={{
                  display: 'flex',
                  background: '#efefec',
                  borderRadius: 8,
                  padding: 2,
                  marginBottom: 6,
                }}
              >
                {(
                  [
                    ['all', 'All'],
                    ['skeleton', 'Skeleton'],
                    ['organs', 'Organs'],
                  ] as const
                ).map(([key, label]) => (
                  <div
                    key={key}
                    onClick={() => preset(key)}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '4px 0',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 11,
                      background: activePreset === key ? '#13242D' : 'transparent',
                      color: activePreset === key ? '#fff' : '#13242D',
                      transition: 'background 150ms',
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {SYSTEMS.map((s) => (
                <div
                  key={s}
                  style={{ display: 'flex', alignItems: 'center', height: 30, gap: 8 }}
                >
                  <span
                    style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[s] }}
                  />
                  <span style={{ flex: 1, textTransform: 'capitalize' }}>{s}</span>
                  <span style={{ color: '#8a8f93', fontSize: 11 }}>{counts[s] ?? 0}</span>
                  <Toggle on={on[s]} onClick={() => setOn({ ...on, [s]: !on[s] })} />
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid rgba(0,0,0,0.06)',
                  color: '#8a8f93',
                }}
              >
                <span>
                  {visibleCount} visible · loaded {loaded}/{total}
                </span>
                <span
                  style={{ cursor: 'pointer', color: '#13242D' }}
                  onClick={() => {
                    setRegion(null)
                    setAll(false)
                  }}
                >
                  Hide all
                </span>
              </div>
            </>
          )}
        </div>

        {/* Specimen collections panel */}
        <div style={{ ...card, padding: 12, flexShrink: 0 }}>
          <div
            onClick={() => setCollectionsOpen(!collectionsOpen)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontWeight: 600 }}>Specimen collections</span>
            <span
              style={{
                color: '#8a8f93',
                display: 'inline-block',
                transition: 'transform 200ms',
                transform: collectionsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            >
              ▾
            </span>
          </div>
          {collectionsOpen && (
            <>
              <div style={{ color: '#8a8f93', fontSize: 11, margin: '4px 0 10px' }}>
                Study the body, region by region.
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                }}
              >
                {REGIONS.map((r) => {
                  const active = region === r
                  return (
                    <button
                      key={r}
                      onClick={() => chooseRegion(r)}
                      style={{
                        border: '1px solid rgba(0,0,0,0.08)',
                        borderRadius: 8,
                        padding: '7px 8px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        background: active ? '#13242D' : '#fff',
                        color: active ? '#fff' : '#13242D',
                        fontSize: 12,
                        transition: 'background 150ms',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{r}</div>
                      <div style={{ fontSize: 10, opacity: 0.65 }}>
                        {regionCounts[r] ?? 0} pieces
                      </div>
                    </button>
                  )
                })}
              </div>
              <div
                style={{
                  display: 'flex',
                  marginTop: 10,
                  background: '#efefec',
                  borderRadius: 8,
                  padding: 2,
                }}
              >
                {(['both', 'left', 'right'] as Side[]).map((s) => (
                  <div
                    key={s}
                    onClick={() => chooseSide(s)}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '5px 0',
                      borderRadius: 6,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      background: side === s ? '#13242D' : 'transparent',
                      color: side === s ? '#fff' : '#13242D',
                      transition: 'background 150ms',
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Info panel (moved left a little so it clears the toolbar) */}
      {selected && (
        <div style={{ ...card, position: 'absolute', right: 76, top: 140, width: 280, padding: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#8a8f93' }}>
            {(CATEGORY[selected.system] ?? 'Structure').toUpperCase()}
          </div>
          <div
            style={{ fontSize: 20, fontWeight: 700, margin: '6px 0 14px', lineHeight: 1.2 }}
          >
            {selected.name}
          </div>
          <MetaRow label="ID" value={selected.id} />
          <MetaRow label="System" value={selected.system} />
          <button
            onClick={() => setIsolated(!isolated)}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '9px 0',
              border: 'none',
              borderRadius: 8,
              background: '#13242D',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {isolated ? 'Show everything again' : 'Isolate structure'}
          </button>
          <div
            onClick={() => select(null)}
            style={{
              marginTop: 10,
              textAlign: 'center',
              color: '#8a8f93',
              cursor: 'pointer',
            }}
          >
            Clear selection
          </div>
        </div>
      )}

      {/* Explode control */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 34,
          transform: 'translateX(-50%)',
          width: 400,
          maxWidth: 'calc(100vw - 48px)',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            fontSize: 9,
            letterSpacing: 2,
            color: '#8a8f93',
            marginBottom: 6,
          }}
        >
          {explode > 0.02 ? 'SPECIMEN ATLAS · FRONT' : 'ANATOMICAL POSITION · FRONT'}
        </div>
        <div
          style={{
            ...card,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span style={{ fontWeight: 600 }}>✦ Explode anatomy</span>
              <span style={{ color: '#8a8f93' }}>{Math.round(explode * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(explode * 100)}
              onChange={(e) => changeExplode(Number(e.target.value) / 100)}
              style={{ width: '100%', accentColor: '#13242D', cursor: 'pointer' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: '#8a8f93',
              }}
            >
              <span>Assembled</span>
              <span>Every piece</span>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(0,0,0,0.08)' }} />
          <button
            onClick={() => changeExplode(0)}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#13242D',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Hover tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          pointerEvents: 'none',
          background: '#13242D',
          color: '#fff',
          padding: '6px 10px',
          borderRadius: 8,
          fontSize: 12,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 150ms',
          zIndex: 10,
        }}
      >
        {hovered && (
          <>
            <div style={{ fontWeight: 600 }}>{hovered.name}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>
              {CATEGORY[hovered.system] ?? 'Structure'}
            </div>
          </>
        )}
      </div>

      {/* Hint + credits */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 11,
          color: '#8a8f93',
          pointerEvents: 'none',
        }}
      >
        Drag to orbit · Scroll to zoom · Click to inspect
      </div>
      <div
        onClick={() => setShowCredits(!showCredits)}
        style={{
          position: 'absolute',
          right: 24,
          bottom: 10,
          fontSize: 11,
          color: '#13242D',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Sources &amp; credits
      </div>
      {showCredits && (
        <div
          style={{
            ...card,
            position: 'absolute',
            right: 24,
            bottom: 36,
            width: 280,
            padding: 14,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Sources &amp; credits</div>
          BodyParts3D, © The Database Center for Life Science licensed under CC
          Attribution 4.0 International
          <div style={{ marginTop: 8 }}>
            <a
              href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#13242D' }}
            >
              BodyParts3D website
            </a>
          </div>
        </div>
      )}
    </div>
  )
}