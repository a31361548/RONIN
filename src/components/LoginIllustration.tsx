"use client"

import Image from 'next/image'
import { useEffect, useRef, type ReactElement } from 'react'
import gsap from 'gsap'

type LayerRef = HTMLDivElement

export function LoginIllustration(): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const sunlightRef = useRef<LayerRef>(null)
  const paperStackRef = useRef<LayerRef>(null)
  const calendarRef = useRef<LayerRef>(null)
  const pencilRef = useRef<LayerRef>(null)
  const paperclipRef = useRef<LayerRef>(null)
  const tapeRef = useRef<LayerRef>(null)
  const gridRef = useRef<LayerRef>(null)

  useEffect(() => {
    const root = rootRef.current

    if (!root) {
      return
    }

    const layers = [
      sunlightRef.current,
      paperStackRef.current,
      calendarRef.current,
      pencilRef.current,
      paperclipRef.current,
      tapeRef.current,
      gridRef.current,
    ].filter((layer): layer is LayerRef => layer !== null)

    const pointerLayers = [paperStackRef.current, calendarRef.current, pencilRef.current, paperclipRef.current, gridRef.current].filter(
      (layer): layer is LayerRef => layer !== null,
    )

    const media = gsap.matchMedia()

    media.add(
      {
        reduceMotion: '(prefers-reduced-motion: reduce)',
        finePointer: '(pointer: fine)',
      },
      (context) => {
        const reduceMotion = context.conditions?.reduceMotion ?? false
        const finePointer = context.conditions?.finePointer ?? false

        if (reduceMotion) {
          gsap.set(layers, { autoAlpha: 1 })
          return
        }

        const intro = gsap.timeline({
          defaults: { ease: 'power3.out' },
        })

        intro
          .fromTo(sunlightRef.current, { autoAlpha: 0, scale: 0.94 }, { autoAlpha: 0.72, scale: 1, duration: 1 })
          .fromTo(gridRef.current, { autoAlpha: 0, x: -16, y: 18, rotation: -8 }, { autoAlpha: 0.56, x: 0, y: 0, rotation: -4, duration: 0.62 }, '<0.12')
          .fromTo(paperStackRef.current, { autoAlpha: 0, x: -24, y: 28, rotation: -6 }, { autoAlpha: 0.82, x: 0, y: 0, rotation: 0, duration: 0.72 }, '<0.12')
          .fromTo(calendarRef.current, { autoAlpha: 0, x: -18, y: 24, rotation: 5 }, { autoAlpha: 0.88, x: 0, y: 0, rotation: 2, duration: 0.64 }, '<0.14')
          .fromTo(pencilRef.current, { autoAlpha: 0, x: 18, y: 20, rotation: -11 }, { autoAlpha: 0.86, x: 0, y: 0, rotation: -7, duration: 0.58 }, '<0.1')
          .fromTo(paperclipRef.current, { autoAlpha: 0, y: -14, rotation: -12 }, { autoAlpha: 0.9, y: 0, rotation: -4, duration: 0.5 }, '<0.08')
          .fromTo(tapeRef.current, { autoAlpha: 0, scale: 0.92, rotation: -8 }, { autoAlpha: 0.78, scale: 1, rotation: -4, duration: 0.48 }, '<0.08')

        if (!finePointer) {
          return
        }

        const handlePointerMove = (event: PointerEvent) => {
          const bounds = root.getBoundingClientRect()
          const normalizedX = (event.clientX - bounds.left) / bounds.width - 0.5
          const normalizedY = (event.clientY - bounds.top) / bounds.height - 0.5

          gsap.to(paperStackRef.current, { x: normalizedX * 10, y: normalizedY * 8, rotation: normalizedX * 1.2, duration: 0.7, ease: 'power3.out', overwrite: 'auto' })
          gsap.to(calendarRef.current, { x: normalizedX * -8, y: normalizedY * -6, rotation: 2 - normalizedX * 1.4, duration: 0.82, ease: 'power3.out', overwrite: 'auto' })
          gsap.to(pencilRef.current, { x: normalizedX * 14, y: normalizedY * 10, rotation: -7 + normalizedX * 1.8, duration: 0.9, ease: 'power3.out', overwrite: 'auto' })
          gsap.to(paperclipRef.current, { x: normalizedX * -6, y: normalizedY * -8, rotation: -4 + normalizedX * 2, duration: 0.76, ease: 'power3.out', overwrite: 'auto' })
          gsap.to(gridRef.current, { x: normalizedX * 5, y: normalizedY * 4, rotation: -4 + normalizedX * 0.8, duration: 1, ease: 'power3.out', overwrite: 'auto' })
        }

        const handlePointerLeave = () => {
          gsap.to(pointerLayers, { x: 0, y: 0, duration: 0.85, rotation: 0, ease: 'power3.out', overwrite: 'auto' })
        }

        root.addEventListener('pointermove', handlePointerMove)
        root.addEventListener('pointerleave', handlePointerLeave)

        return () => {
          root.removeEventListener('pointermove', handlePointerMove)
          root.removeEventListener('pointerleave', handlePointerLeave)
          gsap.killTweensOf(pointerLayers)
          intro.kill()
        }
      },
      root,
    )

    return () => {
      media.revert()
    }
  }, [])

  return (
    <div ref={rootRef} aria-hidden="true" className="pointer-events-auto absolute -inset-x-16 -inset-y-10 z-0 hidden overflow-visible lg:block">
      <div ref={sunlightRef} className="absolute -left-20 -top-8 h-[430px] w-[600px]">
        <Image src="/image/login/login-sunlight.svg" alt="" width={780} height={560} className="h-full w-full object-contain" priority />
      </div>
      <div ref={gridRef} className="absolute bottom-0 left-12 w-[235px]">
        <Image src="/image/login/login-paper-grid.svg" alt="" width={500} height={370} className="h-auto w-full" />
      </div>
      <div ref={paperStackRef} className="absolute -right-8 top-32 w-[235px]">
        <Image src="/image/login/login-paper-stack.svg" alt="" width={560} height={450} className="h-auto w-full" />
      </div>
      <div ref={calendarRef} className="absolute bottom-1 left-0 w-[178px]">
        <Image src="/image/login/login-calendar.svg" alt="" width={340} height={330} className="h-auto w-full" />
      </div>
      <div ref={pencilRef} className="absolute bottom-0 right-16 w-[255px]">
        <Image src="/image/login/login-pencil.svg" alt="" width={480} height={92} className="h-auto w-full" />
      </div>
      <div ref={paperclipRef} className="absolute right-24 top-20 w-[58px]">
        <Image src="/image/login/login-paperclip.svg" alt="" width={160} height={220} className="h-auto w-full" />
      </div>
      <div ref={tapeRef} className="absolute right-36 top-52 w-[100px]">
        <Image src="/image/login/login-washi-tape.svg" alt="" width={230} height={110} className="h-auto w-full" />
      </div>
    </div>
  )
}
