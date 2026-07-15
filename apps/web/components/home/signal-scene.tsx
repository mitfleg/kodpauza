'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { MathUtils, type Group } from 'three';
import { useRef } from 'react';

function AttentionSignal({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<Group>(null);
  const pulseRef = useRef<Group>(null);

  useFrame((state, delta) => {
    const group = groupRef.current;
    const pulse = pulseRef.current;
    if (!group || !pulse || reducedMotion) return;

    group.rotation.x = MathUtils.damp(group.rotation.x, state.pointer.y * 0.12, 3, delta);
    group.rotation.y = MathUtils.damp(group.rotation.y, state.pointer.x * 0.18, 3, delta);
    const scale = 1 + Math.sin(state.clock.elapsedTime * 1.15) * 0.035;
    pulse.scale.setScalar(scale);
  });

  return (
    <group ref={groupRef} rotation={[-0.15, 0.2, 0.1]}>
      <group ref={pulseRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.55, 0.012, 8, 96]} />
          <meshBasicMaterial color="#54d7bd" transparent opacity={0.42} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={0.74}>
          <torusGeometry args={[2.55, 0.009, 8, 96]} />
          <meshBasicMaterial color="#5a8cff" transparent opacity={0.3} />
        </mesh>
      </group>
      {[
        [-2.52, 0, 0.1],
        [2.38, 0.65, -0.1],
        [1.5, -1.9, 0],
      ].map(([x, y, z], index) => (
        <mesh key={`${x}-${y}`} position={[x, y, z]}>
          <sphereGeometry args={[index === 0 ? 0.075 : 0.052, 16, 16]} />
          <meshBasicMaterial color={index === 1 ? '#5a8cff' : '#63e1c7'} />
        </mesh>
      ))}
    </group>
  );
}

export default function SignalScene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <Canvas
      aria-hidden
      camera={{ position: [0, 0, 7], fov: 42 }}
      dpr={[1, 1.5]}
      frameloop={reducedMotion ? 'demand' : 'always'}
      gl={{ alpha: true, antialias: true }}
    >
      <AttentionSignal reducedMotion={reducedMotion} />
    </Canvas>
  );
}
