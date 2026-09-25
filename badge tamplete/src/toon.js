import * as THREE from 'three'
import { MToonMaterial } from '@pixiv/three-vrm-materials-mtoon'

// Тун-режимы собраны только из готовых проверенных решений, без самописных шейдеров:
//  • 'toon'  — THREE.MeshToonMaterial + ступенчатая gradientMap (официальный приём из
//              примера three.js webgl_materials_toon);
//  • 'mtoon' — MToonMaterial из @pixiv/three-vrm (тот самый аниме-шейдер MToon,
//              стандарт VRM-аватаров: тень-цвет, «тунность», rim-подсветка);
//  • обводка — <Outlines> из @react-three/drei (inverted hull);
//  • пост-эффекты — pmndrs/postprocessing (ColorDepth, DotScreen, HueSaturation,
//              BrightnessContrast, Bloom).

export const MATERIAL_MODES = { 'Оригинал (PBR)': 'pbr', 'Toon (three.js)': 'toon', 'MToon (аниме)': 'mtoon' }

// Каждый пресет — полный набор значений панели «Тун-шейдер». После выбора
// пресета любой ползунок можно докрутить руками.
const BASE = {
  mode: 'pbr',
  toonSteps: 3,
  shadowLevel: 0.35,
  metalColor: '#c9ced8',
  saturateMaterials: 1,
  shadeDarkness: 0.45,
  shadeTint: '#3a2f6b',
  toony: 0.9,
  shadingShift: 0,
  rimColor: '#ffffff',
  rimStrength: 0,
  rimPower: 5,
  rimLift: 0,
  keyLight: 0,
  keyAzimuth: 35,
  keyElevation: 40,
  fillLight: 0,
  outline: false,
  outlineThickness: 3,
  outlineColor: '#000000',
  outlineAngle: 180,
  saturation: 0,
  contrast: 0,
  brightness: 0,
  posterize: false,
  posterizeBits: 12,
  halftone: false,
  halftoneScale: 1.4,
  halftoneAngle: 45,
  halftoneOpacity: 0.25,
  toonBloom: 0,
  background: '#000000'
}

export const TOON_PRESETS = {
  '0. Оригинал (PBR)': { ...BASE },
  '1. Классика 3 тона': {
    ...BASE, mode: 'toon', toonSteps: 3, shadowLevel: 0.35, keyLight: 2.6, fillLight: 0.6,
    outline: true, outlineThickness: 3, saturation: 0.15, contrast: 0.15
  },
  '2. Жёсткий 2 тона': {
    ...BASE, mode: 'toon', toonSteps: 2, shadowLevel: 0.25, keyLight: 3, fillLight: 0.45,
    outline: true, outlineThickness: 5, saturation: 0.3, contrast: 0.3, saturateMaterials: 1.3
  },
  '3. Мягкий 5 тонов': {
    ...BASE, mode: 'toon', toonSteps: 5, shadowLevel: 0.45, keyLight: 2.2, fillLight: 0.8,
    outline: true, outlineThickness: 2, outlineColor: '#1b1530', saturation: 0.1, contrast: 0.1
  },
  '4. Аниме MToon': {
    ...BASE, mode: 'mtoon', toony: 0.95, shadingShift: -0.05, shadeDarkness: 0.5, shadeTint: '#3a2f6b',
    rimColor: '#ffffff', rimStrength: 0.35, rimPower: 4, keyLight: 2.4, fillLight: 0.7,
    outline: true, outlineThickness: 3, outlineColor: '#120c24', saturation: 0.2, contrast: 0.15
  },
  '5. MToon Rim-поп': {
    ...BASE, mode: 'mtoon', toony: 1, shadingShift: 0.1, shadeDarkness: 0.65, shadeTint: '#101040',
    rimColor: '#6ff3ff', rimStrength: 1, rimPower: 2.5, rimLift: 0.05, keyLight: 2.2, fillLight: 0.3,
    outline: true, outlineThickness: 4, saturation: 0.35, contrast: 0.35, toonBloom: 0.6, background: '#07060f'
  },
  '6. Пастель MToon': {
    ...BASE, mode: 'mtoon', toony: 0.6, shadingShift: -0.2, shadeDarkness: 0.25, shadeTint: '#7a6cc9',
    rimColor: '#ffe3f1', rimStrength: 0.4, rimPower: 3, keyLight: 2, fillLight: 1.1,
    outline: true, outlineThickness: 2, outlineColor: '#5b4b8a', saturation: -0.05, contrast: -0.05,
    brightness: 0.05, background: '#1b1726'
  },
  '7. Комикс (халфтон)': {
    ...BASE, mode: 'toon', toonSteps: 3, shadowLevel: 0.3, keyLight: 2.8, fillLight: 0.5,
    outline: true, outlineThickness: 5, saturation: 0.4, contrast: 0.35, saturateMaterials: 1.3,
    halftone: true, halftoneScale: 1.3, halftoneAngle: 45, halftoneOpacity: 0.28, background: '#f2e8cf'
  },
  '8. Постеризация': {
    ...BASE, mode: 'pbr', keyLight: 3, fillLight: 1.2, outline: true, outlineThickness: 3,
    posterize: true, posterizeBits: 9, saturation: 0.35, contrast: 0.3, brightness: 0.1, background: '#20242c'
  },
  '9. Неон': {
    ...BASE, mode: 'mtoon', toony: 1, shadingShift: 0.3, shadeDarkness: 0.8, shadeTint: '#1a0033',
    rimColor: '#ff3df5', rimStrength: 1.2, rimPower: 2, keyLight: 1.6, fillLight: 0.2,
    outline: true, outlineThickness: 4, outlineColor: '#00e5ff', saturation: 0.5, contrast: 0.3,
    toonBloom: 1.4, background: '#05010d'
  },
  '10. Плоский флэт': {
    ...BASE, mode: 'toon', toonSteps: 2, shadowLevel: 0.8, keyLight: 1.6, fillLight: 1.4,
    outline: true, outlineThickness: 6, saturation: 0.45, contrast: 0.2, saturateMaterials: 1.4, background: '#ffd84d'
  }
}

export const DEFAULT_PRESET = '0. Оригинал (PBR)'

// ?toon=4 в адресе сразу открывает пресет №4 — удобно слать заказчику ссылкой.
export function getInitialPreset() {
  const n = new URLSearchParams(window.location.search).get('toon')
  if (n == null) return DEFAULT_PRESET
  return Object.keys(TOON_PRESETS).find((name) => name.startsWith(`${n}.`)) ?? DEFAULT_PRESET
}

// Ступенчатая карта освещённости — ровно так, как в официальном примере three.js
// webgl_materials_toon: N пикселей + NearestFilter, без интерполяции.
const gradientCache = new Map()
export function getGradientMap(steps, shadowLevel) {
  const key = `${steps}:${shadowLevel.toFixed(3)}`
  if (gradientCache.has(key)) return gradientCache.get(key)
  const data = new Uint8Array(steps * 4)
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 1 : i / (steps - 1)
    const v = Math.round(255 * THREE.MathUtils.lerp(shadowLevel, 1, t))
    data.set([v, v, v, 255], i * 4)
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat)
  texture.minFilter = texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  gradientCache.set(key, texture)
  return texture
}

const isBrushed = (m) => m?.name?.startsWith('Anisotropic Brushed Metal')

function baseColorOf(original, params) {
  const color = original.color ? original.color.clone() : new THREE.Color('white')
  if (isBrushed(original) && !original.map) color.set(params.metalColor)
  if (params.saturateMaterials !== 1) {
    const hsl = {}
    color.getHSL(hsl)
    color.setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s * params.saturateMaterials, 0, 1), hsl.l)
  }
  return color
}

function createToon(original) {
  const m = new THREE.MeshToonMaterial()
  m.name = `${original.name}__toon`
  m.map = original.map ?? null
  m.emissiveMap = original.emissiveMap ?? null
  m.alphaMap = original.alphaMap ?? null
  m.normalMap = original.normalMap ?? null
  m.side = original.side
  m.transparent = original.transparent
  m.opacity = original.opacity
  m.alphaTest = original.alphaTest
  return m
}

function updateToon(m, original, params) {
  m.color.copy(baseColorOf(original, params))
  m.emissive.copy(original.emissive ?? new THREE.Color('black'))
  m.emissiveIntensity = original.emissiveIntensity ?? 1
  const gradient = getGradientMap(params.toonSteps, params.shadowLevel)
  if (m.gradientMap !== gradient) {
    m.gradientMap = gradient
    m.needsUpdate = true
  }
}

function createMToon(original) {
  const m = new MToonMaterial({
    map: original.map ?? null,
    emissiveMap: original.emissiveMap ?? null,
    normalMap: original.normalMap ?? null,
    side: original.side,
    transparent: original.transparent,
    alphaTest: original.alphaTest
  })
  m.name = `${original.name}__mtoon`
  m.opacity = original.opacity
  return m
}

const tmpColor = new THREE.Color()
function updateMToon(m, original, params) {
  const base = baseColorOf(original, params)
  m.color.copy(base)
  // Цвет тени = базовый цвет, притемнённый и подкрашенный в shadeTint (классика аниме).
  tmpColor.set(params.shadeTint)
  m.shadeColorFactor.copy(base).multiplyScalar(1 - params.shadeDarkness).lerp(tmpColor, params.shadeDarkness * 0.35)
  m.shadingToonyFactor = params.toony
  m.shadingShiftFactor = params.shadingShift
  m.emissive.copy(original.emissive ?? new THREE.Color('black'))
  m.emissiveIntensity = original.emissiveIntensity ?? 1
  m.parametricRimColorFactor.set(params.rimColor).multiplyScalar(params.rimStrength)
  m.parametricRimFresnelPowerFactor = params.rimPower
  m.parametricRimLiftFactor = params.rimLift
  m.rimLightingMixFactor = 1
  m.giEqualizationFactor = 0.9
  m.update(0)
}

// Подменяем материалы у мешей модели в зависимости от режима. Оригиналы храним в
// userData, тун-материалы кешируем, так что переключение пресетов мгновенное.
export function applyToonMaterials(root, params) {
  root.traverse((object) => {
    if (!object.isMesh) return
    const ud = object.userData
    // Пропускаем служебные меши обводки (<Outlines> использует ShaderMaterial).
    if (!ud.toonOriginal && [].concat(object.material).some((m) => m?.isShaderMaterial)) return
    if (!ud.toonOriginal) ud.toonOriginal = object.material
    if (!ud.toonCache) ud.toonCache = {}
    const originals = Array.isArray(ud.toonOriginal) ? ud.toonOriginal : [ud.toonOriginal]
    if (params.mode === 'pbr') {
      object.material = ud.toonOriginal
      return
    }
    if (!ud.toonCache[params.mode]) {
      ud.toonCache[params.mode] = originals.map((o) => (params.mode === 'mtoon' ? createMToon(o) : createToon(o)))
    }
    const list = ud.toonCache[params.mode]
    list.forEach((m, i) => (params.mode === 'mtoon' ? updateMToon(m, originals[i], params) : updateToon(m, originals[i], params)))
    object.material = Array.isArray(ud.toonOriginal) ? list : list[0]
  })
}
