
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap } from 'gsap'

type Point = { x: number; y: number }

const props = defineProps<{
  lettersRoot: HTMLElement | null
  indexes: number[]
}>()

const svg = ref<SVGSVGElement | null>(null)

// Each beam has its own growth progress
const growth = new Map<number, { amount: number }>()

const layers = new Map<number, {
  body: SVGPathElement
  glow: SVGPathElement
}>()

const tweens: gsap.core.Tween[] = []

// tracking

const beamMouse = { x: -10000, y: -10000 }

// Original centerlines, before mouse deformation
const beamCenterlines = new Map<number, Point[]>()

const setPointer = (x: number, y: number) => {
  beamMouse.x = x
  beamMouse.y = y
}

// Check whether the mouse is close to the middle of a beam
const isNearBeam = (mouseX: number, mouseY: number, radius = 65) => {
  const matrix = svg.value?.getScreenCTM()
  if (!matrix) return false

  for (const points of beamCenterlines.values()) {
    for (let i = 4; i < points.length - 4; i += 2) {
      const point = points[i]!
      const screen = new DOMPoint(
        point.x, point.y
      ).matrixTransform(matrix)

      if (Math.hypot(
        screen.x - mouseX,
        screen.y - mouseY
      ) < radius) {
        return true
      }
    }
  }

  return false
}

// Called by App.vue when a fragment begins being caught

const activate = (index: number) => {
  const state = growth.get(index)
  if (!state) return

  tweens.push(gsap.to(state, {
    amount: 1,
    duration: 0.32,
    ease: 'power2.out',

    // The beam has now reached its fragment
    onComplete: () => {
      const letter = props.lettersRoot
        ?.querySelectorAll<HTMLElement>('.sit-letter')[index]

      const fragment = letter
        ?.querySelector<HTMLElement>('.fragment-motion')

      fragment?.classList.add('stasis-caught')
    }
  }))
}


defineExpose({ activate, setPointer, isNearBeam })

// Calculate a point on a cubic Bézier curve
const curvePoint = (
  a: Point, b: Point, c: Point, d: Point, t: number
): Point => {
  const u = 1 - t

  return {
    x: u ** 3 * a.x + 3 * u ** 2 * t * b.x +
       3 * u * t ** 2 * c.x + t ** 3 * d.x,

    y: u ** 3 * a.y + 3 * u ** 2 * t * b.y +
       3 * u * t ** 2 * c.y + t ** 3 * d.y
  }
}

// Create the flowing, variable-width beam
const liquidShape = (
  start: Point,
  end: Point,
  time: number,
  index: number,
  cursor: Point
) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)

  if (length < 1) {
    return { path: '', centerline: [] as Point[] }
  }

  const nx = -dy / length
  const ny = dx / length

  const bend = Math.min(45, length * 0.20)
  const sway = Math.sin(time * 1.5 + index) * 7

  const p1 = {
    x: start.x + dx * 0.30 + nx * (bend + sway),
    y: start.y + dy * 0.30 + ny * (bend + sway)
  }

  const p2 = {
    x: start.x + dx * 0.70 - nx * bend * 0.55,
    y: start.y + dy * 0.70 - ny * bend * 0.55
  }

  const left: Point[] = []
  const right: Point[] = []
  const centerline: Point[] = []

  for (let i = 0; i <= 32; i++) {
    const t = i / 32
    const point = curvePoint(start, p1, p2, end, t)


    // Keep the original path for mouse hit detection
    centerline.push(point)

    // How far is the cursor from this particular point?
    const distance = Math.hypot(
      point.x - cursor.x,
      point.y - cursor.y
    )

    // Mouse influence fades with distance
    const influence = Math.max(0, 1 - distance / 110)

    // Lock the starting and ending points in place
    const endpointLock = Math.sin(Math.PI * t) ** 2

    // Push only the nearby part of the liquid
    const push = 25 * influence ** 2 * endpointLock

    const awayX = distance > 0.01
      ? (point.x - cursor.x) / distance
      : 0

    const awayY = distance > 0.01
      ? (point.y - cursor.y) / distance
      : -1

    const movedPoint = {
      x: point.x + awayX * push,
      y: point.y + awayY * push
    }


    // Estimate the direction along the curve
    const before = curvePoint(
      start, p1, p2, end, Math.max(0, t - 0.001)
    )
    const after = curvePoint(
      start, p1, p2, end, Math.min(1, t + 0.001)
    )

    const tx = after.x - before.x
    const ty = after.y - before.y
    const tangentLength = Math.hypot(tx, ty) || 1

    const sideX = -ty / tangentLength
    const sideY = tx / tangentLength

    // Rounded areas of liquid along the beam

    // If you want:
    // - fatter start → raise sourceMax
    // - fatter end → raise endMax
    // - skinnier middle → lower midMin
    // - more ripple → raise 0.08 to like 0.11
    // - less ripple → lower 0.08 to like 0.05

    const sourceMax = 22 // widest at the source
    const midMin = 6 // skinniest in the middle
    const endMax = 13 // width near the fragment end

    // Big source bulge
    const sourceBulge = Math.exp(-(((t - 0.08) / 0.22) ** 2))

    // bigger end connection
    const endBulge = Math.exp(-(((t - 0.92) / 0.18) ** 2))

    // Radius changes as the liquid stretches
    const widthCore = midMin + (sourceMax - midMin) * sourceBulge + (endMax - midMin) * endBulge

    const ripple =
      1 + Math.sin(time * 2.2 + t * 11 + index) * 0.08

    const radius = widthCore * ripple


    left.push({
      x: movedPoint.x + sideX * radius,
      y: movedPoint.y + sideY * radius
    })

    right.push({
      x: movedPoint.x - sideX * radius,
      y: movedPoint.y - sideY * radius
    })
  
  }

  const coords = (p: Point) => `${p.x} ${p.y}`

  // Round the ends so the beam resembles stretched liquid
  const endCap = {
    x: end.x + dx / length * 10,
    y: end.y + dy / length * 10
  }

  const startCap = {
    x: start.x - dx / length * 10,
    y: start.y - dy / length * 10
  }

  const path = `
    M ${left.map(coords).join(' L ')}
    Q ${coords(endCap)} ${coords(right[32]!)}
    L ${right.slice(0, 32).reverse().map(coords).join(' L ')}
    Q ${coords(startCap)} ${coords(left[0]!)}
    Z
  `

  return { path, centerline }
}



// Adjust the position of individual liquid envelopes
const envelopeOffsets: Record<number, Point> = {
  0: { x: -5, y: -7 },  // S in SIT
  1: { x: -5, y: -2 },  // I in SIT
  4: { x: -4, y: -12 }, // S in STILL
  5: { x: -6, y: 5 },  // T in STILL
  8: { x: -2, y: -5 }   // Last L in STILL
}


 // Draw a freeform liquid shape around a fragment
const liquidEnvelopeShape = (
  fragment: HTMLElement,
  time: number,
  index: number
) => {
  const width = fragment.clientWidth
  const height = fragment.clientHeight

  if (!width || !height) return ''

  // Read the polygon already used to clip this fragment
  const clip = getComputedStyle(fragment).clipPath

  const matches = Array.from(
    clip.matchAll(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/g)
  )

  if (matches.length < 3) return ''

  // Convert the clip's percentages into local pixel positions
  const vertices = matches.map(match => ({
    x: (Number(match[1]) / 100) * width,
    y: (Number(match[2]) / 100) * height
  }))

  const xs = vertices.map(point => point.x)
  const ys = vertices.map(point => point.y)

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)


  // Get this specific letter's position adjustment
  const offset = envelopeOffsets[index] ?? { x: 0, y: 0 }

  // Calculate the envelope's center
  const centerX = (minX + maxX) / 2 + offset.x
  const centerY = (minY + maxY) / 2 + 10 + offset.y


  // Customize the amount of engulfing
  const padding = 16
  const coverage = 0.4

  const radiusX = (maxX - minX) * coverage + padding
  const radiusY = (maxY - minY) * coverage + padding

  const points: Point[] = []
  const steps = 36

  // Build the moving boundary of the liquid
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2

    // Similar wave movement to our stasis beam
    const ripple1 =
      Math.sin(angle * 3 + time * 2.2 + index) * 0.04

    const ripple2 =
      Math.sin(angle * 5 - time * 1.5 + index * 1.7) * 0.035

    const ripple = 1 + ripple1 + ripple2

    points.push({
      x: centerX + Math.cos(angle) * radiusX * ripple,
      y: centerY + Math.sin(angle) * radiusY * ripple
    })
  }

  // Connect the points with smooth quadratic curves
  const first = points[0]!
  const last = points[steps - 1]!

  let path = `
    M ${(last.x + first.x) / 2}
      ${(last.y + first.y) / 2}
  `

  for (let i = 0; i < steps; i++) {
    const point = points[i]!
    const next = points[(i + 1) % steps]!

    const midX = (point.x + next.x) / 2
    const midY = (point.y + next.y) / 2

    path += `
      Q ${point.x} ${point.y}
        ${midX} ${midY}
    `
  }

  return path + ' Z'
}

// Redraw every active beam as its fragment moves
const updateBeams = () => {
  if (!svg.value || !props.lettersRoot) return

  const matrix = svg.value.getScreenCTM()
  if (!matrix) return

  const inverse = matrix.inverse()


  const cursor = new DOMPoint(
    beamMouse.x,
    beamMouse.y
  ).matrixTransform(inverse)


  const letters =
    props.lettersRoot.querySelectorAll<HTMLElement>('.sit-letter')

  for (const index of props.indexes) {
    const state = growth.get(index)
    const layer = layers.get(index)
    const letter = letters[index]

    if (!state || !layer || !letter || state.amount <= 0) {
      continue
    }

    const emitter =
      letter.querySelector<HTMLElement>('.stasis-emitter')
    const target =
      letter.querySelector<HTMLElement>('.stasis-target')

    if (!emitter || !target) continue

    const sourceRect = emitter.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()

    // Convert browser positions to SVG positions
    const start = new DOMPoint(
      sourceRect.left, sourceRect.top
    ).matrixTransform(inverse)

    const destination = new DOMPoint(
      targetRect.left, targetRect.top
    ).matrixTransform(inverse)

    const end = {
      x: start.x + (destination.x - start.x) * state.amount,
      y: start.y + (destination.y - start.y) * state.amount
    }


    const liquid = liquidShape(
      start,
      end,
      gsap.ticker.time,
      index,
      cursor
    )

    layer.body.setAttribute('d', liquid.path)
    layer.glow.setAttribute('d', liquid.path)

    beamCenterlines.set(index, liquid.centerline)



    // Find the moving fragment and its new SVG envelope
    const fragmentMotion =
      letter.querySelector<HTMLElement>('.fragment-motion')

    // Only draw engulfing energy after capture
    if (fragmentMotion?.classList.contains('stasis-caught')) {
      const fragment =
        fragmentMotion.querySelector<HTMLElement>('.letter-fragment')

      const envelopeSvg =
        fragmentMotion.querySelector<SVGSVGElement>(
          '.stasis-envelope-svg'
        )

      const envelopePath =
        envelopeSvg?.querySelector<SVGPathElement>(
          '.stasis-envelope-shape'
        )

      if (fragment && envelopeSvg && envelopePath) {
        // Match the SVG coordinate system to the letter
        envelopeSvg.setAttribute(
          'viewBox',
          `0 0 ${fragment.clientWidth} ${fragment.clientHeight}`
        )

        // Generate a fresh liquid shape every frame
        const envelopeShape = liquidEnvelopeShape(
          fragment,
          gsap.ticker.time,
          index
        )

        envelopePath.setAttribute('d', envelopeShape)
      }
    }

  }
}

onMounted(() => {
  if (!svg.value) return

  for (const index of props.indexes) {
    const group = svg.value.querySelector<SVGGElement>(
      `[data-beam-index="${index}"]`
    )

    const body =
      group?.querySelector<SVGPathElement>('.beam-body')
    const glow =
      group?.querySelector<SVGPathElement>('.beam-glow')

    if (!body || !glow) continue

    growth.set(index, { amount: 0 })
    layers.set(index, { body, glow })
  }

  gsap.ticker.add(updateBeams)
})

onUnmounted(() => {
  gsap.ticker.remove(updateBeams)
  tweens.forEach(tween => tween.kill())
})
</script>

<template>
  <svg ref="svg" class="stasis-beams" aria-hidden="true">

    <defs>
      <!-- Organic liquid surrounding each captured fragment -->
      <filter
        id="stasis-liquid-envelope"
        x="-60%"
        y="-60%"
        width="220%"
        height="220%"
        color-interpolation-filters="sRGB"
      >
        <!-- Expand the fragment's visible silhouette -->
        <feMorphology
          in="SourceAlpha"
          operator="dilate"
          radius="6"
          result="expanded"
        />

        <!-- Generate a changing liquid texture -->
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.025 0.032"
          numOctaves="2"
          seed="5"
          result="noise"
        >
          <animate
            attributeName="baseFrequency"
            values="0.025 0.032; 0.038 0.026; 0.025 0.032"
            dur="3.1s"
            repeatCount="indefinite"
          />
        </feTurbulence>

        <!-- Distort the outside into organic waves -->
        <feDisplacementMap
          in="expanded"
          in2="noise"
          scale="8"
          xChannelSelector="R"
          yChannelSelector="G"
          result="liquid"
        >
          <animate
            attributeName="scale"
            values="7; 11; 8; 10; 7"
            dur="3.1s"
            repeatCount="indefinite"
          />
        </feDisplacementMap>

        <!-- Make the expanded liquid solid blue -->
        <feFlood
          flood-color="#3e5ed8"
          result="liquidBlue"
        />

        <feComposite
          in="liquidBlue"
          in2="liquid"
          operator="in"
          result="liquidFill"
        />
      </filter>
    </defs>

    <g v-for="index in indexes"
      :key="index"
      :data-beam-index="index"
    >

      <path class="beam-glow" />
      <path class="beam-body" />

    </g>

  </svg>

</template>

<style scoped>
.stasis-beams {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}

.beam-glow {
  fill: #3e5ed8;
  opacity: 0.2;
  filter: blur(10px);
}

.beam-body {
  fill: #3e5ed8;
  opacity: 1;
}
</style>
