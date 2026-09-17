import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, extend, useThree, useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF, useTexture, Environment, Lightformer } from '@react-three/drei'
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'
import { useControls } from 'leva'
extend({ MeshLineGeometry, MeshLineMaterial })
const MODEL_SCALE = 2.25
const ATTACH_INSET = 0.06 // на сколько утопить кончик ленты внутрь корпуса
const BRUSHED_METAL_NAME = 'Anisotropic Brushed Metal'
const brushedMaterials = new Set()
const brushedUniforms = {
  grooveScale: { value: 230 },
  grooveStrength: { value: 0.38 },
  circularGrooves: { value: 1 }
}
useTexture.preload('/textures/band.jpg')

function useLatestModelUrl() {
  const [modelUrl, setModelUrl] = useState(null)
  useEffect(() => {
    let active = true
    const update = async () => {
      try {
        const response = await fetch('/models/current-model.json', { cache: 'no-store' })
        if (!response.ok) return
        const manifest = await response.json()
        if (active && manifest.url) setModelUrl((current) => current === manifest.url ? current : manifest.url)
      } catch (_error) {
        // The watcher may be rewriting the tiny manifest during this request.
      }
    }
    update()
    const interval = window.setInterval(update, 1000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])
  return modelUrl
}

function makeBrushedMetal(material) {
  // MeshPhysicalMaterial exposes Three's real anisotropic GGX BRDF.
  // Copy keeps the glTF colour, maps, alpha and metalness settings intact.
  const brushed = new THREE.MeshPhysicalMaterial()
  // A glTF may provide either MeshStandardMaterial or MeshPhysicalMaterial.
  // Copy only their shared Standard PBR fields; Physical.copy assumes optional
  // vectors such as clearcoatNormalScale always exist on the source.
  THREE.MeshStandardMaterial.prototype.copy.call(brushed, material)
  brushed.defines = { STANDARD: '', PHYSICAL: '' }
  brushed.metalness = 1
  brushed.roughness = 0.22
  brushed.anisotropy = 0.92
  brushed.anisotropyRotation = 0
  brushedMaterials.add(brushed)
  brushed.onBeforeCompile = (shader) => {
    shader.uniforms.uBrushedGrooveScale = brushedUniforms.grooveScale
    shader.uniforms.uBrushedGrooveStrength = brushedUniforms.grooveStrength
    shader.uniforms.uBrushedCircularGrooves = brushedUniforms.circularGrooves
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vBrushedRadialTangent;\nvarying vec3 vBrushedLocalPosition;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // The local XY radial direction becomes the grain direction in view space.
        vec3 brushedLocalTangent = normalize(vec3(-position.y, position.x, 0.0));
        vBrushedRadialTangent = normalize(mat3(modelViewMatrix) * brushedLocalTangent);
        vBrushedLocalPosition = position;`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        `material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;`,
        `// Replace UV tangents with the radial direction used by the Blender material.
	vec3 brushedTangent = normalize(vBrushedRadialTangent - normal * dot(normal, vBrushedRadialTangent));
	material.anisotropyT = brushedTangent;
	material.anisotropyB = normalize(cross(normal, brushedTangent));`
      )
      .replace(
        '#include <lights_physical_fragment>',
        `// Visible micro-grooves. Their changing roughness breaks the reflection into
        // concentric brushed streaks instead of leaving a featureless grey metal.
        float brushedRadius = length(vBrushedLocalPosition.xy);
        float brushedAngle = atan(vBrushedLocalPosition.y, vBrushedLocalPosition.x);
        float brushedCoordinate = mix(vBrushedLocalPosition.x, brushedRadius, uBrushedCircularGrooves);
        float brushedGrooves = 0.5 + 0.5 * sin(brushedCoordinate * uBrushedGrooveScale + sin(brushedAngle * 28.0) * 0.55);
        roughnessFactor = mix(roughnessFactor, mix(0.14, 0.30, brushedGrooves), uBrushedGrooveStrength);
        #include <lights_physical_fragment>`
      )
      .replace(
        'void main() {',
        `uniform float uBrushedGrooveScale;
        uniform float uBrushedGrooveStrength;
        uniform float uBrushedCircularGrooves;
        varying vec3 vBrushedRadialTangent;
        varying vec3 vBrushedLocalPosition;
        void main() {`
      )
  }
  brushed.customProgramCacheKey = () => 'radial-brushed-metal-v2'
  brushed.needsUpdate = true
  return brushed
}

function addBrushedMetalShader(root) {
  root.traverse((object) => {
    if (!object.isMesh) return
    const replaceMaterial = (material) => material?.name?.startsWith(BRUSHED_METAL_NAME) ? makeBrushedMetal(material) : material
    object.material = Array.isArray(object.material) ? object.material.map(replaceMaterial) : replaceMaterial(object.material)
  })
  return root
}

export default function App() {
  const modelUrl = useLatestModelUrl()
  const physics = useControls('Физика', {
    debug: false,
    staticPreview: { value: false, label: 'Статичный предпросмотр' },
    maxDragRotation: { value: 90, min: 1, max: 90, step: 1, label: 'Макс. поворот' },
    rotationSmoothness: { value: 14, min: 1, max: 30, step: 1, label: 'Плавность поворота' }
  })
  const lighting = useControls('Свет', {
    ambient: { value: 0, min: 0, max: 8, step: 0.05, label: 'Общий свет' },
    lowerLight: { value: 2.5, min: 0, max: 20, step: 0.1, label: 'Нижний софтбокс' },
    leftLight: { value: 0, min: 0, max: 20, step: 0.1, label: 'Левый софтбокс' },
    topLight: { value: 0.9, min: 0, max: 20, step: 0.1, label: 'Верхний софтбокс' },
    rimLight: { value: 0, min: 0, max: 30, step: 0.1, label: 'Контровой свет' },
    exposure: { value: 0.1, min: 0.1, max: 3, step: 0.05, label: 'Экспозиция' },
    bloom: { value: 0, min: 0, max: 3, step: 0.05, label: 'Сияние' },
    bloomThreshold: { value: 0, min: 0, max: 2, step: 0.05, label: 'Порог сияния' },
    bloomRadius: { value: 0, min: 0, max: 1, step: 0.05, label: 'Радиус сияния' }
  })
  const metal = useControls('Анизотропный металл', {
    metalness: { value: 1, min: 0, max: 1, step: 0.01, label: 'Металличность' },
    roughness: { value: 0.22, min: 0.02, max: 1, step: 0.01, label: 'Шероховатость' },
    anisotropy: { value: 0.92, min: 0, max: 1, step: 0.01, label: 'Анизотропия' },
    grooveStrength: { value: 0.38, min: 0, max: 1, step: 0.01, label: 'Сила следов' },
    grooveScale: { value: 230, min: 20, max: 600, step: 1, label: 'Масштаб следов' },
    circularGrooves: { value: true, label: 'Круговые следы' }
  })
  useEffect(() => {
    brushedUniforms.grooveScale.value = metal.grooveScale
    brushedUniforms.grooveStrength.value = metal.grooveStrength
    brushedUniforms.circularGrooves.value = metal.circularGrooves ? 1 : 0
    brushedMaterials.forEach((material) => {
      material.metalness = metal.metalness
      material.roughness = metal.roughness
      material.anisotropy = metal.anisotropy
    })
  }, [metal])
  return (
    <Canvas camera={{ position: [0, 0, 13], fov: 25 }}>
      <RendererSettings exposure={lighting.exposure} />
      <ambientLight intensity={lighting.ambient} />
      {modelUrl && (physics.staticPreview ? <StaticAssembly key={modelUrl} modelUrl={modelUrl} /> : (
        <Physics key={modelUrl} debug={physics.debug} interpolate gravity={[0, -40, 0]} timeStep={1 / 120}>
          <Band modelUrl={modelUrl} maxRotationDegrees={physics.maxDragRotation} rotationSmoothness={physics.rotationSmoothness} />
        </Physics>
      ))}
      <Environment background blur={0.75}>
        <color attach="background" args={['black']} />
        <Lightformer intensity={lighting.lowerLight} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={lighting.leftLight} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={lighting.topLight} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={lighting.rimLight} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
      </Environment>
      <EffectComposer multisampling={0}>
        <Bloom intensity={lighting.bloom} luminanceThreshold={lighting.bloomThreshold} luminanceSmoothing={0.9} mipmapBlur radius={lighting.bloomRadius} />
      </EffectComposer>
    </Canvas>
  )
}
function RendererSettings({ exposure }) {
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = exposure
  }, [gl, exposure])
  return null
}
function StaticAssembly({ modelUrl }) {
  const { scene } = useGLTF(modelUrl)
  const model = useMemo(() => scene.clone(true), [scene])
  return (
    <group position={[0, 0, 0]} scale={MODEL_SCALE}>
      <primitive object={model} />
    </group>
  )
}
function Band({ modelUrl, maxSpeed = 50, minSpeed = 10, maxRotationDegrees = 90, rotationSmoothness = 14 }) {
  const band = useRef(), fixed = useRef(), j1 = useRef(), j2 = useRef(), j3 = useRef(), card = useRef(), badge = useRef(), badgePivot = useRef(), animationOpen = useRef(false), dragStart = useRef(null) // prettier-ignore
  const vec = new THREE.Vector3(), ang = new THREE.Vector3(), rot = new THREE.Vector3(), dir = new THREE.Vector3() // prettier-ignore
  const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 2, linearDamping: 1.5 }
  const { scene, animations } = useGLTF(modelUrl)
  const texture = useTexture('/textures/band.jpg')
  const badgeModel = useMemo(() => scene.clone(true), [scene])
  // Художник в Blender ставит пустышку (Empty) туда, где физически находится
  // петля/дырка на бейдже для ремешка. Ищем такую пустышку среди
  // верхнеуровневых объектов модели и используем её как точку крепления —
  // тогда ремешок всегда попадает точно в петлю, а не "залезает" на корпус.
  // Если пустышки в модели нет — используем старые захардкоженные числа.
  // Ремешок должен входить в бейдж СВЕРХУ ПО ЦЕНТРУ. Берём габариты модели и
  // считаем точку "верх, центр по X/Z" — её и совмещаем с концом верёвки.
  // ATTACH_INSET чуть утапливает кончик ленты внутрь корпуса, чтобы он не торчал.
  const attachOffset = useMemo(() => {
    const box = new THREE.Box3().setFromObject(badgeModel)
    if (box.isEmpty()) return [0, -2.65, -0.05]
    const center = box.getCenter(new THREE.Vector3())
    const attach = new THREE.Vector3(center.x, box.max.y - ATTACH_INSET / MODEL_SCALE, center.z)
    return attach.multiplyScalar(-MODEL_SCALE).toArray()
  }, [badgeModel])
  const { actions } = useAnimations(animations, badge)
  const { width, height } = useThree((state) => state.size)
  const [curve] = useState(() => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]))
  const [dragged, drag] = useState(false)
  const [hovered, hover] = useState(false)
  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]) // prettier-ignore
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]) // prettier-ignore
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]) // prettier-ignore
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.45, 0]]) // prettier-ignore
  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab'
      return () => void (document.body.style.cursor = 'auto')
    }
  }, [hovered, dragged])
  const toggleAnimation = () => {
    const playForward = !animationOpen.current
    animationOpen.current = playForward
    Object.values(actions).forEach((action) => {
      if (!action) return
      action.reset()
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.enabled = true
      action.timeScale = playForward ? 1 : -1
      action.time = playForward ? 0 : action.getClip().duration
      action.play()
    })
  }
  useFrame((state, delta) => {
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      dir.copy(vec).sub(state.camera.position).normalize()
      vec.add(dir.multiplyScalar(state.camera.position.length()))
      ;[card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp())
      card.current?.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z })
    }
    // The rope joint owns the rigid body rotation, so the interaction tilt belongs on
    // the visual group. This keeps it responsive while preserving the physics chain.
    // Rotation exists only while the pointer is held. Moving 0.75 of the viewport
    // reaches the configured limit; smaller movements interpolate proportionally.
    const maxRotation = THREE.MathUtils.degToRad(maxRotationDegrees)
    const pointerPull = dragged && dragStart.current
      ? THREE.MathUtils.clamp((state.pointer.x - dragStart.current.pointerX) / 0.75, -1, 1)
      : 0
    const pullAngle = pointerPull * maxRotation
    if (badgePivot.current) {
      badgePivot.current.rotation.z = THREE.MathUtils.damp(badgePivot.current.rotation.z, pullAngle, rotationSmoothness, delta)
      badgePivot.current.rotation.y = THREE.MathUtils.damp(badgePivot.current.rotation.y, -pullAngle, rotationSmoothness, delta)
    }
    if (fixed.current && j1.current && j2.current && j3.current && card.current && band.current) {
      // Fix most of the jitter when over pulling the card
      ;[j1, j2].forEach((ref) => {
        if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation())
        const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())))
        ref.current.lerped.lerp(ref.current.translation(), delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed)))
      })
      // Calculate catmul curve
      curve.points[0].copy(j3.current.translation())
      curve.points[1].copy(j2.current.lerped)
      curve.points[2].copy(j1.current.lerped)
      curve.points[3].copy(fixed.current.translation())
      band.current.geometry.setPoints(curve.getPoints(32))
      // Tilt it back towards the screen
      if (!dragged) {
        ang.copy(card.current.angvel())
        rot.copy(card.current.rotation())
        card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z })
      }
    }
  })
  curve.curveType = 'chordal'
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[2, 0, 0]} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group ref={badgePivot} position={[0, 1.45, 0]}>
            <group
              ref={badge}
              scale={MODEL_SCALE}
              position={attachOffset}
              onPointerOver={() => hover(true)}
              onPointerOut={() => hover(false)}
              onClick={(e) => {
                e.stopPropagation()
                toggleAnimation()
              }}
              onPointerUp={(e) => {
                e.target.releasePointerCapture(e.pointerId)
                dragStart.current = null
                drag(false)
              }}
              onPointerDown={(e) => {
                e.target.setPointerCapture(e.pointerId)
                dragStart.current = { pointerX: e.pointer.x }
                drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())))
              }}>
              <primitive object={badgeModel} />
            </group>
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial color="white" resolution={[width, height]} useMap map={texture} repeat={[-3, 1]} lineWidth={1} />
      </mesh>
    </>
  )
}
