import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

function PlaceholderBody() {
  return (
    <group>
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshStandardMaterial color="#d9d6cf" />
      </mesh>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[0.5, 0.9, 0.25]} />
        <meshStandardMaterial color="#d9d6cf" />
      </mesh>
      <mesh position={[-0.15, 0.25, 0]}>
        <boxGeometry args={[0.2, 0.9, 0.2]} />
        <meshStandardMaterial color="#d9d6cf" />
      </mesh>
      <mesh position={[0.15, 0.25, 0]}>
        <boxGeometry args={[0.2, 0.9, 0.2]} />
        <meshStandardMaterial color="#d9d6cf" />
      </mesh>
    </group>
  )
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#F3F3F1' }}>
      <Canvas camera={{ position: [0, 1.1, 4], fov: 40 }}>
        <color attach="background" args={['#F3F3F1']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 4]} intensity={0.8} />
        <PlaceholderBody />
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          target={[0, 1, 0]}
        />
      </Canvas>
    </div>
  )
}