<script setup lang="ts">
  import { ref, onMounted, onUnmounted } from 'vue'
  import { gsap } from 'gsap'
  import StasisBeams from './components/StasisBeams.vue'

  // Reference to the IDEAS element
  const ideasFall = ref<HTMLElement | null>(null)
  const portfolioScene = ref<HTMLElement | null>(null)
  const sitRise = ref<HTMLElement | null>(null)
  const sitLetters = [
    { char: 'S', x: -0.5, y: -0.65 + 0.4, rotation: -8, scale: 1.8, color: '#70a279' },
    { char: 'I', x: -0.1, y: -0.03 + 0.4, rotation: 15, scale: 1.7, color: '#a8dcb3' },
    { char: 'T', x: 0, y: -0.5 + 0.4, rotation: -3, scale: 1.5, color: '#a7bea8' },

    { char: ' ', x: 0, y: 0 + 0.4, rotation: 0, scale: 1.5, color: '#70a279' },

    { char: 'S', x: 0.2, y: 0.12 + 0.4, rotation: 13, scale: 1.4, color: '#a8dcb3' },
    { char: 'T', x: 0.2, y: -0.2 + 0.4, rotation: -7, scale: 1.2, color: '#a7bea8' },
    { char: 'I', x: 0.2, y: 0.20 + 0.4, rotation: 11, scale: 1.1, color: '#70a279' },
    { char: 'L', x: 0.3, y: -0.07 + 0.4, rotation: 13, scale: 1.2, color: '#a7bea8' },
    { char: 'L', x: 0.5, y: 0.06 + 0.4, rotation: -10, scale: 1.7, color: '#70a279' },
  ]

  const crumbleConfigs: Record<number, {
  faceClip: string
  fragmentClip: string
  fragmentOrigin: string
  speckScale?: number
  }> = {
    // 0 = S in SIT -> TOP RIGHT chunk
    0: {
      faceClip: `polygon(
        0% 0%,
        58% 0%,
        64% 15%,
        73% 23%,
        65% 34%,
        80% 43%,
        100% 50%,
        100% 100%,
        0% 100%
      )`,
      fragmentClip: `polygon(
        58% 0%,
        100% 0%,
        100% 50%,
        80% 43%,
        65% 34%,
        73% 23%,
        64% 15%
      )`,

      fragmentOrigin: '79% 24%',
      speckScale: 0.65
    },

    // 1 = I in SIT -> BOTTOM RIGHT chunk
    1: {
      faceClip: `polygon(
        0% 0%,
        100% 0%,
        100% 65%,
        85% 73%,
        72% 81%,
        62% 90%,
        53% 100%,
        0% 100%
      )`,
      fragmentClip: `polygon(
        100% 65%,
        100% 100%,
        53% 100%,
        62% 90%,
        72% 81%,
        85% 73%
      )`,
      fragmentOrigin: '82% 88%',
      speckScale: 0.5
    },

    // 4 = S in STILL -> BOTTOM LEFT chunk
    4: {
      faceClip: `polygon(
        0% 0%,
        100% 0%,
        100% 100%,
        40% 100%,
        28% 92%,
        16% 82%,
        0% 72%
      )`,
      fragmentClip: `polygon(
        0% 72%,
        16% 82%,
        28% 92%,
        40% 100%,
        0% 100%
      )`,
      fragmentOrigin: '18% 88%',
      speckScale: 0.85
    },

    // 5 = T in STILL -> keep your fixed version
    5: {
      faceClip: `polygon(
        0% 25%,
        8% 19%,
        14% 25%,
        20% 13%,
        30% 0%,
        100% 0%,
        100% 100%,
        0% 100%
      )`,
      fragmentClip: `polygon(
        0% 0%,
        30% 0%,
        20% 13%,
        14% 25%,
        8% 19%,
        0% 25%
      )`,
      fragmentOrigin: '15% 14%',
      speckScale: 0.65
    },

    // 8 = last L in STILL -> BOTTOM LEFT chunk, larger than before
    8: {
      faceClip: `polygon(
        0% 0%,
        100% 0%,
        100% 100%,
        44% 100%,
        28% 90%,
        0% 76%
      )`,
      fragmentClip: `polygon(
        0% 76%,
        28% 90%,
        44% 100%,
        0% 100%
      )`,
      fragmentOrigin: '18% 90%',
      speckScale: 1.1
    }
  }

  const crackedLetterIndexes = new Set([0, 1, 4, 5, 8])
  const crumbleLetterIndexes = new Set([0, 1, 4, 5, 8])

  // Letters that will generate stasis beams
  const beamLetterIndexes = Array.from(crumbleLetterIndexes)

  // reference to the SVG containing our beams
  const stasisBeams = ref<{
    activate: (index: number) => void
  } | null>(null)

  // Where each beam begins on the blue letter shadow
  const beamOrigins: Record<number, {
    left: string
    top: string
  }> = {
    0: { left: '60%', top: '88%' }, // S in SIT
    1: { left: '60%', top: '70%' }, // I in SIT
    4: { left: '20%', top: '80%' }, // S in STILL
    5: { left: '60%', top: '83%' }, // T in STILL
    8: { left: '20%', top: '80%' }  // Last L in STILL
  }

  // Find where the beam connects to a broken fragment
  const getFragmentAnchor = (index: number) => {
    const origin =
      crumbleConfigs[index]?.fragmentOrigin ?? '50% 50%'

    const [left, top] = origin.split(' ')

    return { left, top }
  }

  const sitFit = ref<HTMLElement | null>(null)

  const brownEdgeLeft = ref<HTMLElement | null>(null)
  const brownEdgeRight = ref<HTMLElement | null>(null)

  const sitContact = ref<HTMLElement | null>(null)
  const sitContactBelow = ref<HTMLElement | null>(null)

  const dontDrop = ref<HTMLElement | null>(null)

  // Our introduction animation timeline
  let introTimeline: gsap.core.Timeline | undefined
  let cleanupRepulsion: (() => void) | undefined

  const updateSitScale = () => {
    if (!sitFit.value) return

    const designWidth = 1870

    const scale = Math.min(
      1,
      window.innerWidth / designWidth
    )

    gsap.set(sitFit.value, {
      scale: scale
    })
  }


const calculateSitHitY = () => {
  // Read the positions of the four markers
  const left = brownEdgeLeft.value?.getBoundingClientRect()
  const right = brownEdgeRight.value?.getBoundingClientRect()

  const contact = sitContact.value?.getBoundingClientRect()
  const below = sitContactBelow.value?.getBoundingClientRect()

  if (!left || !right || !contact || !below) return 0

  // Calculate the slope of the brown boundary
  const edgeWidth = right.left - left.left

  // Find how far 1px of GSAP movement travels on screen
  const movementRate = (below.top - contact.top) / 100

  if (Math.abs(edgeWidth) < 0.001 ||
      Math.abs(movementRate) < 0.001) return 0

  // Find the boundary height where SIT STILL approaches it
  const boundaryY =
    left.top +
    ((contact.left - left.left) / edgeWidth) *
    (right.top - left.top)

  // Calculate how far SIT STILL must move upward
  return (boundaryY - contact.top) / movementRate
}


  onMounted(() => {
    if (
      !ideasFall.value ||
      !portfolioScene.value ||
      !sitRise.value ||
      !sitFit.value ||
      !dontDrop.value
    ) return

    updateSitScale()

    window.addEventListener('resize', updateSitScale)


    const letterElements = sitRise.value.querySelectorAll<HTMLElement>('.sit-letter')
    const crackedLetters = sitRise.value.querySelectorAll<HTMLElement>('.has-crack')
    const crumbleLetters = sitRise.value.querySelectorAll<HTMLElement>('.will-crumble')
    const fragments = sitRise.value.querySelectorAll<HTMLElement>('.fragment-motion')
    const specks = sitRise.value.querySelectorAll<HTMLElement>('.crumble-speck')

    gsap.set(letterElements, {
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1
    })

    gsap.set(fragments, {
      opacity: 0,
      x: 0,
      y: 0,
      rotation: 0,
      transformOrigin: '80% 25%'
    })

    gsap.set(specks, {
      opacity: 0,
      x: 0,
      y: 0,
      rotation: 0
    })



    type ScreenPoint = {
      x: number
      y: number
    }

    type RepelItem = {
      letter: HTMLElement
      center: ScreenPoint
      emitter: ScreenPoint | null
      target: ScreenPoint | null
      x: number
      y: number
    }

    // These values control the feeling of the interaction
    const repelRadius = 190
    const maxPush = 18
    const smoothness = 0.14

    // Keep the cursor far away until the mouse moves
    const mouse = {
      x: -10000,
      y: -10000
    }

    let repelReady = false

    const repelItems: RepelItem[] = Array.from(
      letterElements,
      letter => ({
        letter,
        center: { x: 0, y: 0 },
        emitter: null,
        target: null,
        x: 0,
        y: 0
      })
    )

    // Find the visual center of an element
    const getCenter = (element: Element): ScreenPoint => {
      const rect = element.getBoundingClientRect()

      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }
    }

    // Measure the letters after their intro positions settle
    const measureRepelPositions = () => {
      if (!repelReady) return

      // Temporarily remove the hover offsets for accurate measuring
      repelItems.forEach(item => {
        item.letter.style.translate = '0px 0px'
      })

      repelItems.forEach(item => {
        item.center = getCenter(item.letter)

        const emitter = item.letter.querySelector(
          '.stasis-emitter'
        )

        const target = item.letter.querySelector(
          '.stasis-target'
        )

        item.emitter = emitter ? getCenter(emitter) : null
        item.target = target ? getCenter(target) : null
      })

      // Restore the current hover offsets
      repelItems.forEach(item => {
        item.letter.style.translate =
          `${item.x}px ${item.y}px`
      })
    }

    // Track mouse position inside the hero
    const handleMouseMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return

      const hero = sitRise.value?.closest('.hero')
      if (!hero) return

      const rect = hero.getBoundingClientRect()

      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom

      if (inside) {
        mouse.x = event.clientX
        mouse.y = event.clientY
      } else {
        mouse.x = -10000
        mouse.y = -10000
      }
    }

    const clearMouse = () => {
      mouse.x = -10000
      mouse.y = -10000
    }

    // Find the closest point on a straight segment
    // This also lets the mouse react near each blue beam
    const closestBeamPoint = (
      start: ScreenPoint,
      end: ScreenPoint
    ): ScreenPoint => {
      const dx = end.x - start.x
      const dy = end.y - start.y
      const lengthSquared = dx * dx + dy * dy

      const t = lengthSquared > 0
        ? Math.max(0, Math.min(1,
            ((mouse.x - start.x) * dx +
            (mouse.y - start.y) * dy) / lengthSquared
          ))
        : 0

      return {
        x: start.x + dx * t,
        y: start.y + dy * t
      }
    }

    // Run a small repulsion update every animation frame
    const updateRepulsion = () => {
      if (!repelReady) return

      const smoothing =
        1 - Math.pow(1 - smoothness, gsap.ticker.deltaRatio(60))

      repelItems.forEach(item => {
        // Start with the center of the original letter
        let nearest = item.center

        let distance = Math.hypot(
          mouse.x - nearest.x,
          mouse.y - nearest.y
        )

        // Also respond when the cursor approaches the stasis beam
        // or its captured fragment
        if (item.emitter && item.target) {
          const beamPoint = closestBeamPoint(
            item.emitter,
            item.target
          )

          const beamDistance = Math.hypot(
            mouse.x - beamPoint.x,
            mouse.y - beamPoint.y
          )

          if (beamDistance < distance) {
            nearest = beamPoint
            distance = beamDistance
          }
        }

        let pushX = 0
        let pushY = 0

        if (distance < repelRadius) {
          const strength = Math.pow(
            1 - distance / repelRadius,
            2
          )

          const directionX = distance > 0.01
            ? (nearest.x - mouse.x) / distance
            : 0

          const directionY = distance > 0.01
            ? (nearest.y - mouse.y) / distance
            : -1

          pushX = directionX * maxPush * strength
          pushY = directionY * maxPush * strength
        }

        // Smoothly move toward the new offset
        item.x += (pushX - item.x) * smoothing
        item.y += (pushY - item.y) * smoothing

        // Independent of GSAP's original transform
        item.letter.style.translate =
          `${item.x.toFixed(2)}px ${item.y.toFixed(2)}px`
      })
    }

    // Activate listeners
    window.addEventListener('pointermove', handleMouseMove, {
      passive: true
    })
    window.addEventListener('blur', clearMouse)
    window.addEventListener('resize', measureRepelPositions)
    window.addEventListener('scroll', measureRepelPositions, {
      passive: true
    })

    gsap.ticker.add(updateRepulsion)

    // Remove everything when the component is destroyed
    cleanupRepulsion = () => {
      window.removeEventListener('pointermove', handleMouseMove)
      window.removeEventListener('blur', clearMouse)
      window.removeEventListener('resize', measureRepelPositions)
      window.removeEventListener('scroll', measureRepelPositions)

      gsap.ticker.remove(updateRepulsion)

      repelItems.forEach(item => {
        item.letter.style.translate = ''
      })
    }



    // Creating the timeline
    introTimeline = gsap.timeline()

    // controls the making the "IDEAS" fall
    introTimeline.fromTo(
      ideasFall.value,
      { y: -window.innerHeight },
      {
        y: 0,
        duration: 1.1,
        ease: 'power4.in'
      }
    )

    introTimeline.addLabel('impact')

    introTimeline
      .to(portfolioScene.value, {
        x:-10,
        y: 4,
        duration: 0.045,
        ease: 'none'
      }, 'impact')
      .to(portfolioScene.value, {
        x: 8,
        y: -4,
        duration: 0.05,
        ease: 'none'
      })
      .to(portfolioScene.value, {
        x:-5,
        y: 2,
        duration: 0.06,
        ease: 'none'
      })
      .to(portfolioScene.value, {
        x: 3,
        y: -1,
        duration: 0.06,
        ease: 'none'
      })
      .to(portfolioScene.value, {
        x: 0,
        y: 0,
        duration: 0.09,
        ease: 'power2.out'
      })

      // Compress IDEAS on impact
      introTimeline
        .to(ideasFall.value, {
          scaleY: 0.86,
          scaleX: 1.045,
          transformOrigin: 'center bottom',
          duration: 0.07,
          ease: 'power2.out'
        }, 'impact')

        // Recoil upward
        .to(ideasFall.value, {
          scaleY: 1.04,
          scaleX: 0.99,
          y: -8,
          duration: 0.13,
          ease: 'power2.out'
        }, 'impact+=0.07')

        // Return to original shape
        .to(ideasFall.value, {
          scaleY: 1,
          scaleX: 1,
          y: 0,
          duration: 0.17,
          ease: 'power2.out'
        }, 'impact+=0.20')

      const particles =
        // Finds all particles inside the IDEAS element
        ideasFall.value.querySelectorAll('.impact-chip')

      introTimeline
        // Make particles visibile at impact
        .set(particles, {
          opacity: 1,
          x: 0,
          y: 0
        }, 'impact')

        .to(particles, {
          x: (i) => (i - 5) * 13,
          y: (i) => -12 - (i % 3) * 10,
          rotation: (i) => i % 2 === 0 ? -40 : 40,

          duration: 0.14,
          ease: 'power2.out'
        }, 'impact')

        .to(particles, {
          x: (i) => (i - 5) * 24,
          y: (i) => 100 + (i % 4) * 24,
          rotation: (i) => i % 2 === 0 ? -130 : 130,
          opacity: 0,

          duration: 0.55,
          ease: 'power2.in'
        }, 'impact+=0.14')

      introTimeline.fromTo(
        sitRise.value,
        {
          y: () => window.innerHeight * 0.8
        },
        {
          y: calculateSitHitY,
          duration: 0.4,
          ease: 'power4.in'
        },
        'impact+=0.35'
      )

      introTimeline.addLabel('sitImpact')


      introTimeline
        .to(portfolioScene.value, {
            x:-17,
            y: 8,
            duration: 0.045,
            ease: 'none'
          }, 'sitImpact')

          .to(portfolioScene.value, {
            x: 14,
            y: -6,
            duration: 0.05,
            ease: 'none'
          })

          .to(portfolioScene.value, {
            x: -8,
            y: 3,
            duration: 0.06,
            ease: 'none'
          })

          .to(portfolioScene.value, {
            x: 4,
            y: -2,
            duration: 0.06,
            ease: 'none'
          })

          .to(portfolioScene.value, {
            x: 0,
            y: 0,
            duration: 0.10,
            ease: 'power2.out'
          })

      // Sit Still compresses on impact
      introTimeline
        .to(sitRise.value, {
          scaleY: 0.82,
          scaleX: 1.04,
          transformOrigin: 'center top',
          duration: 0.08,
          ease: 'power2.out'
        }, 'sitImpact')

        // Recoil downward from the collision
        .to(sitRise.value, {
          scaleY: 1.06,
          scaleX: 0.98,
          y: '+=12',
          duration: 0.12,
          ease: 'power2.out'
        }, 'sitImpact+=0.08')

        // Return to original shape
        .to(sitRise.value, {
          y: 0,
          scaleY: 1,
          scaleX: 1,
          duration: 0.85,
          ease: 'power2.inOut'
        }, 'sitImpact+=0.20')

      introTimeline.to(letterElements, {
        x: (i) => `${sitLetters[i]?.x ?? 0}em`,
        y: (i) => `${sitLetters[i]?.y ?? 0}em`,

        rotation: (i) => sitLetters[i]?.rotation ?? 0,
        scale: (i) => sitLetters[i]?.scale ?? 1,

        duration: 0.60,
        ease: 'power2.out',

        stagger: {
          each: 0.02,
          from: 'center'
        }
      }, 'sitImpact+=0.25')

      introTimeline.to(crackedLetters, {
        '--crack-visibility': 1,

        duration: 0.16,
        ease: 'none',

        stagger: {
          each: 0.025,
          from: 'center'
        }
      }, 'sitImpact+=0.02')

      // This is when Dont should begin sliding
      introTimeline.addLabel('dontStart', 'sitImpact+=0.4')

      introTimeline
        .set(dontDrop.value, {
          autoAlpha: 1
        }, 'dontStart')

        .to(dontDrop.value, {
          y: 0,
          duration: 1.85,
          ease: 'power1.inOut'
        }, 'dontStart')

      // a mark for when dont finishes moving
      introTimeline.addLabel('dontSettled', 'dontStart+=1.55')


      // Start breaking pieces off after DON'T settles
      introTimeline.addLabel('crumbleStart', 'dontSettled+=0.15')

      // Remove a matching section from the main letters

      introTimeline.add(() => {
        letterElements.forEach((letterEl, letterIndex) => {

          // Get the settings for this specific letter
          const config = crumbleConfigs[letterIndex]

          if (!config) return

          // Find its fragment and small debris
          const fragment =
            letterEl.querySelector<HTMLElement>('.letter-fragment')

          const specksInLetter =
            letterEl.querySelectorAll<HTMLElement>('.crumble-speck')

          // Remove the matching part of the original letter
          gsap.set(letterEl, {
            '--face-clip': config.faceClip
          })

          // Shape the detached piece
          if (fragment) {
            gsap.set(fragment, {
              clipPath: config.fragmentClip,
            })
          }

          // Rotate the wrapper around the original pivot
          const fragmentMotion = letterEl.querySelector<HTMLElement>('.fragment-motion')

          if (fragmentMotion) {
            gsap.set(fragmentMotion, {
              transformOrigin: config.fragmentOrigin
            })
          }

          // Customize the small debris
          gsap.set(specksInLetter, {
            scale: config.speckScale ?? 1
          })

        })
      }, 'crumbleStart')


      // Reveal the matching detached pieces
      introTimeline.set(fragments, {
        opacity: 1
      }, 'crumbleStart')



      const getClearFallY = (
        fragment: HTMLElement,
        minimumEm: number
      ) => {
        // Find the lowest edge of the letters
        const letterBottom = Math.max(
          ...Array.from(letterElements, letter =>
            letter.getBoundingClientRect().bottom
          )
        )

        const fragmentTop = fragment.getBoundingClientRect().top
        const letter = fragment.parentElement

        if (!letter) return minimumEm

        // Measure how far one local em moves on screen
        const probeA = document.createElement('span')
        const probeB = document.createElement('span')

        for (const probe of [probeA, probeB]) {
          probe.style.cssText =
            'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;'
          letter.appendChild(probe)
        }

        probeB.style.transform = 'translateY(1em)'

        const pixelsPerEm =
          probeB.getBoundingClientRect().top -
          probeA.getBoundingClientRect().top

        probeA.remove()
        probeB.remove()

        if (pixelsPerEm <= 0) return minimumEm

        // Give the fragment a small clear gap
        const requiredEm =
          (letterBottom + 20 - fragmentTop) / pixelsPerEm

        return Math.max(minimumEm, requiredEm)
      }




      const fragmentFalls: Record<number,  {
        spread: number
        drop: number
        rotation: number
      }> = {
        0: { spread: 0.2, drop: 1.4, rotation: 270 }, // S (Sit)
        1: { spread: 0.25, drop: 0.9, rotation:  220 }, // I (sit)
        4: { spread: -0.34, drop: 0.6, rotation: -210 }, // S (Still)
        5: { spread: -0.10, drop: 1.4, rotation:  -370 }, // T (Still)
        8: { spread: -0.4, drop: 1.2, rotation: -270} // L
      }

      // Controls how dramatically gravity accelerates
      const gravityPower = 9


      fragments.forEach((fragment, i) => {

        // Find which SIT STILL letter owns this fragment
        const parentLetter =
          fragment.closest<HTMLElement>('.sit-letter')

        const letterIndex = parentLetter
          ? Array.from(letterElements).indexOf(parentLetter)
          : -1

        // Get the falling settings for that letter
        const fall = fragmentFalls[letterIndex]

        if (!fall) return

        // Total rotation from the heading and individual letter
        const angle =
          (sitLetters[letterIndex]?.rotation ?? 0) - 5.6

        const angleRadians = angle * Math.PI / 180

        const motion = { t: 0 }
        let clearDrop = fall.drop

        introTimeline!.to(motion, {
          t: 1,
          duration: 1,
          ease: 'none',

          onStart: () => {
            clearDrop = getClearFallY(fragment, fall.drop)
          },

          onUpdate: () => {
            const t = motion.t

            // Increasing downward speed
            const y = clearDrop * Math.pow(t, gravityPower)

            // Very small sideways motion
            const outward = fall.spread * Math.pow(t, 2)

            // Correct the diagonal movement caused by rotation
            const rotationCorrection =
              y * Math.tan(angleRadians)

            const x = rotationCorrection + outward

            gsap.set(fragment, {
              x: `${x}em`,
              y: `${y}em`,
              rotation: fall.rotation * t
            })
          }

        }, `crumbleStart+=${i * 0.10}`)

        // Activate this letter's liquid beam near the end of its fall
        introTimeline!.call(
          () => {
            stasisBeams.value?.activate(letterIndex)
          },
          undefined,
          `crumbleStart+=${i * 0.10 + .81}`
        )

      })








      specks.forEach((speck, i) => {
        const motion = { t: 0 }

        const direction = i % 2 === 0 ? -1 : 1
        const spread = direction * (0.05 + (i % 3) * 0.025)
        const drop = 0.75 + (i % 4) * 0.18
        const spin = direction * (25 + (i % 3) * 10)

        introTimeline!.to(motion, {
          t: 1,
          duration: 0.8,
          ease: 'none',
          onUpdate: () => {
            const t = motion.t

            const x = spread * (0.15 * t + 0.85 * t * t)
            const y = drop * t * t

            gsap.set(speck, {
              x: `${x}em`,
              y: `${y}em`,
              rotation: spin * t,
              opacity: 1 - t
            })
          }
        }, `crumbleStart+=${0.08 + i * 0.015}`)
      })


      // Start mouse interaction only after the intro is complete
      introTimeline.eventCallback('onComplete', () => {
        repelReady = true
        measureRepelPositions()
      })



  })


  onUnmounted(() => {
    window.removeEventListener('resize', updateSitScale)

    cleanupRepulsion?.()

    introTimeline?.kill()
  })

</script>

<template>
  <div ref="portfolioScene" class="portfolio">

    <!-- Navigation -->
    <header class="navbar">
      <a href="#home">HACO</a>
    </header>

    <!-- Main content -->
     <main>

        <!-- Hero Section -->
        <section id="home" class="hero">


          <h1 class="hero-title">

            <span class="ideas-stage">

              <!-- Brown background-->
              <span class="hero-top" aria-hidden="true"></span>

              <span
                ref = "brownEdgeLeft"
                class = "brown-edge-marker brown-edge-left"
                aria-hidden = "true"
              ></span>

              <span
                ref = "brownEdgeRight"
                class = "brown-edge-marker brown-edge-right"
                aria-hidden = "true"
              ></span>

              <span class="ideas">

                <span class="ideas-word">

                  <span ref="ideasFall" class="ideas-fall">
                    IDEAS <!-- span isolates specific parts of that heading -->

                    <!-- Particles -->
                    <span class="impact-dust" aria-hidden="true">
                      <span
                      v-for="n in 11"
                      :key="n"
                      class="impact-chip"
                      :style="{ left: `${n * 8}%` }"
                      ></span>
                    </span>

                  </span>
                </span>


                <span class="dont-word">
                  <span ref="dontDrop" class="dont-drop">
                    DON'T
                  </span>
                </span>


              </span>

            </span>

            <span class="sit-still">

              <span ref="sitFit" class="sit-fit">
                <!-- Measured the top of SIT STILL -->
                <span
                  ref="sitContact"
                  class="sit-contact"
                  aria-hidden="true"
                ></span>

                <!-- Second point for measuring movement-->
                <span
                  ref="sitContactBelow"
                  class="sit-contact sit-contact-below"
                  aria-hidden="true"
                ></span>

                <span ref="sitRise" class="sit-rise">

                  <span
                    v-for="(letter, index) in sitLetters"
                    :key="index"
                    class="sit-letter"
                    :class="{
                      'has-crack': crackedLetterIndexes.has(index),
                      'will-crumble': crumbleLetterIndexes.has(index)
                    }"
                    :data-char="letter.char"
                    :style="{ color: letter.color }"
                  >
                    <!-- Keeps the original character width -->
                    <span class="letter-measure" v-text="letter.char"></span>

                    <template v-if="letter.char.trim()">

                      <!-- Blue shadow -->
                      <span class="letter-shadow" v-text="letter.char"></span>

                      <!-- Green letter -->
                      <span class="letter-face" v-text="letter.char"></span>

                      <!-- A small duplicate of the same letter -->
                      <span
                        v-if="crumbleLetterIndexes.has(index)"
                        class="fragment-motion"
                      >

                        <!-- Liquid energy surrounding the chunk -->
                        <svg
                          class="stasis-envelope-svg"
                          aria-hidden="true"
                          preserveAspectRatio="none"
                        >

                          <path class="stasis-envelope-shape"></path>
                        </svg>

                        <!-- The actual clipped piece-->
                        <span
                          class="letter-fragment"
                          v-text="letter.char"
                        ></span>

                        <!-- Where the stasis beam connects -->
                        <span
                          class="stasis-target"
                          :style="getFragmentAnchor(index)"
                          aria-hidden="true"
                        ></span>
                      </span>


                      <!-- Where the beam emerges from the blue shadow -->
                      <span
                        v-if="crumbleLetterIndexes.has(index)"
                        class="stasis-emitter"
                        :style="beamOrigins[index]"
                        aria-hidden="true"
                      ></span>


                      <!-- Tiny debris from the fractured letter -->
                      <span
                        v-for="n in (crumbleLetterIndexes.has(index) ? 5 : 0)"
                        :key="`speck-${n}`"
                        class="crumble-speck"
                        :class="`speck-${n}`"
                        aria-hidden="true"
                      ></span>

                    </template>
                  </span>

                </span>

              </span>

            </span>

          </h1>

          <StasisBeams
            ref="stasisBeams"
            :letters-root="sitRise"
            :indexes="beamLetterIndexes"
          />

        </section>

        <!-- About Section -->
        <section id="about" class="landscape">


          <div class="cliff cliff-left" aria-hidden="true"></div>
          <div class="cliff cliff-right" aria-hidden="true"></div>


          <div class="mountain-group">
            <div class="mountain-placeholder" aria-hidden="true"></div>
            <h2 class="mountain-label">WHO I AM</h2>
          </div>

        </section>

     </main>

  </div>
</template>


