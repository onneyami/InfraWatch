import React, { useEffect, useRef, useState } from 'react'

interface RevealOnScrollProps {
  children: React.ReactNode
  delay?: number
  style?: React.CSSProperties
}

/**
 * Показывает children с плавным появлением (fade + slide up), когда блок
 * попадает в область видимости при скролле. Once — анимация не повторяется
 * при повторном скролле туда-сюда, чтобы не мельтешить.
 */
export const RevealOnScroll: React.FC<RevealOnScrollProps> = ({ children, delay = 0, style }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`welcome-reveal ${visible ? 'is-visible' : ''}`}
      style={{ animationDelay: visible ? `${delay}ms` : undefined, ...style }}
    >
      {children}
    </div>
  )
}
