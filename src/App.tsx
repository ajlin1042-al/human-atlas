import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'

type Part = {
  id: string
  name: string
  system: string
  meshFile: string
}

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

function PartMesh({ part }: { part: Part }) {
  const { scene } = useGLTF(part.meshFile)
  const cloned = scene.clone()
  cloned.traverse((o: any) => {
    if (o.isMesh) {
      o.material = o.material.clone()
      o.material.color.set(COLORS[part.system] ?? '#cccccc')
    }
  })
  return <primitive object={cloned} />
}

export default function App() {
  const [parts, setParts] = useState<Part[]>([])

  useEffect(() => {
    fetch('/anatomy/manifest.json')
      .then((r) => r.json())
      .then(setParts)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#F3F3F1' }}>
      <Canvas camera={{ position: [0, 1.1, 4], fov: 40 }}>
        <color attach="background" args={['#F3F3F1']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 4]} intensity={0.8} />
        <Suspense fallback={null}>
          {/* mm -> metres, and Z-up -> Y-up */}
          <group scale={0.001} rotation={[-Math.PI / 2, 0, 0]}>
            {parts.map((p) => (
              <PartMesh key={p.id} part={p} />
            ))}
          </group>
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.05} target={[0, 1, 0]} />
      </Canvas>
    </div>
  )
}