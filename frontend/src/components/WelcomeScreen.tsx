import React, { useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Activity, Container, ShieldCheck } from 'lucide-react'
import { RevealOnScroll } from './RevealOnScroll'

interface WelcomeScreenProps {
  onGetStarted: () => void
}

interface Star {
  x: number
  y: number
  size: number
  minOpacity: number
  maxOpacity: number
  duration: number
  delay: number
}

function generateStars(count: number): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * 100,
      // Горизонт теперь занимает только нижние ~6% экрана — звёзды могут
      // покрывать почти всю высоту, а не только верхнюю часть.
      y: Math.random() * 88,
      size: Math.random() > 0.6 ? 2 : 1,
      minOpacity: 0.2 + Math.random() * 0.2,
      maxOpacity: 0.7 + Math.random() * 0.3,
      duration: 3 + Math.random() * 5,
      delay: Math.random() * 6,
    })
  }
  return stars
}

// Диаметр планеты и позиция горизонта выведены из ОДНОЙ переменной — над
// экраном всегда остаётся ровно ~6% диаметра, независимо от разрешения.
const PLANET_SIZE = 'clamp(2500px, 170vw, 3200px)'

// Насколько далеко звезда "уходит" за горизонт при полном скролле секции,
// и на каком расстоянии скролла это происходит.
const STAR_SINK_MAX = 420
const STAR_SINK_SCROLL_RANGE = 480

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGetStarted }) => {
  const stars = useMemo(() => generateStars(90), [])
  const [hovered, setHovered] = useState(false)
  const [scrollY, setScrollY] = useState(0)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollY(e.currentTarget.scrollTop)
  }

  const sinkProgress = Math.min(scrollY / STAR_SINK_SCROLL_RANGE, 1)
  const starSink = sinkProgress * STAR_SINK_MAX
  const starOpacity = 1 - sinkProgress
  const starsDrift = Math.min(scrollY * 0.12, 60)

  return (
    <div
      onScroll={handleScroll}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: '#05060D',
        zIndex: 9999,
        ['--planet-size' as any]: PLANET_SIZE,
      }}
    >
      {/* HERO — прилипает к верху на весь первый экран, дальше контент
          скроллится поверх него */}
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', zIndex: 1 }}>
        {/* Layer 1 — мягкое центральное свечение фона */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 38%, rgba(82,120,255,0.08), transparent 60%)',
          }}
        />

        {/* Layer 2 — космическая дымка, едва заметная */}
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            left: '-10%',
            width: '55%',
            height: '55%',
            background: 'radial-gradient(circle, rgba(157,69,255,0.5), transparent 70%)',
            opacity: 0.05,
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '5%',
            right: '-15%',
            width: '60%',
            height: '60%',
            background: 'radial-gradient(circle, rgba(59,164,255,0.5), transparent 70%)',
            opacity: 0.05,
            filter: 'blur(70px)',
          }}
        />

        {/* Layer 3 — звёзды, мерцают не синхронно, при скролле медленно
            дрейфуют вверх (эффект глубины/движения вперёд) */}
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-starsDrift}px)`, willChange: 'transform' }}>
          {stars.map((s, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.size,
                height: s.size,
                borderRadius: '50%',
                background: '#FFFFFF',
                ['--star-min-opacity' as any]: s.minOpacity,
                ['--star-max-opacity' as any]: s.maxOpacity,
                animation: `welcomeTwinkle ${s.duration}s ease-in-out infinite`,
                animationDelay: `${s.delay}s`,
              }}
            />
          ))}
        </div>

        {/* Свечение вдоль горизонта — мягкое, широкое, максимально
            концентрировано по центру и полностью рассеивается к краям.
            Несколько слоёв разного радиуса/blur вместо резких лучей —
            даёт настоящий soft glow, а не полосы. */}
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(var(--planet-size) * -0.94 - 60px)',
            left: '50%',
            width: '200%',
            height: 720,
            transform: 'translateX(-50%)',
            background: 'radial-gradient(ellipse 55% 100% at 50% 100%, rgba(255,255,255,0.28), transparent 70%)',
            filter: 'blur(85px)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(var(--planet-size) * -0.94 - 30px)',
            left: '50%',
            width: '120%',
            height: 460,
            transform: 'translateX(-50%)',
            background: 'radial-gradient(ellipse 40% 100% at 50% 100%, rgba(255,255,255,0.48), rgba(225,215,255,0.22) 45%, transparent 78%)',
            filter: 'blur(50px)',
            pointerEvents: 'none',
          }}
        />

        {/* Light Source — Полярная звезда, восходящая точно над горизонтом.
            Рендерится ДО планеты, чтобы при скролле, когда звезда "тонет"
            вниз, купол планеты естественно перекрывал её (обычный порядок
            прорисовки в стеке, без сложного clip-path). */}
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(var(--planet-size) * -0.94)',
            left: '50%',
            width: 450,
            height: 450,
            transformOrigin: 'center',
            animation: 'welcomeBreathe 6s ease-in-out infinite',
            opacity: starOpacity,
            ['--star-sink' as any]: `${starSink}px`,
            pointerEvents: 'none',
            willChange: 'transform, opacity',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.9), transparent 55%)', filter: 'blur(50px)' }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, #5EA9FF, transparent 60%)', filter: 'blur(70px)', opacity: 0.8 }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, #995CFF, transparent 65%)', filter: 'blur(90px)', opacity: 0.7 }} />
        </div>

        {/* Planet — гигантская сфера, видна только верхняя дуга. Кольцо
            сделано через вложенный div (внешний = градиентный фон, padding =
            толщина рамки, внутренний = тёмная поверхность) — надёжнее, чем
            составной background-clip, который не проверить без сборки.
            Рендерится ПОСЛЕ звезды — перекрывает её при заходе за горизонт. */}
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(var(--planet-size) * -0.94)',
            left: '50%',
            width: 'var(--planet-size)',
            height: 'var(--planet-size)',
            transform: 'translateX(-50%)',
            borderRadius: '50%',
            background: 'linear-gradient(90deg, #FFFFFF, #E8DBFF)',
            padding: 2,
            boxShadow: '0 -50px 180px rgba(220,210,255,0.12)',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 50% 8%, #14161f 0%, #0a0b12 40%, #05060a 75%)',
            }}
          />
        </div>

        {/* Контент */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            maxWidth: 720,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <img
            src="/assets/logo.png"
            alt="Ahova"
            style={{
              width: 'clamp(72px, 8vw, 120px)',
              height: 'clamp(72px, 8vw, 120px)',
              objectFit: 'contain',
              animation: 'welcomeLogoIn 700ms ease both',
            }}
          />

          <h1
            style={{
              marginTop: 28,
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              fontWeight: 700,
              fontSize: 'clamp(48px, 7vw, 96px)',
              letterSpacing: '-0.03em',
              color: '#FFFFFF',
              lineHeight: 1,
              animation: 'welcomeTitleIn 700ms ease both',
            }}
          >
            Ahova
          </h1>

          <p
            style={{
              marginTop: 20,
              fontSize: 'clamp(18px, 2.2vw, 32px)',
              fontWeight: 400,
              lineHeight: 1.45,
              color: 'rgba(255,255,255,0.85)',
              animation: 'welcomeFadeUp 700ms ease 100ms both',
            }}
          >
            The easiest way to manage
            <br />
            <span
              style={{
                background: 'linear-gradient(90deg, #3DA4FF, #A04DFF)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              your first server.
            </span>
          </p>

          <button
            onClick={onGetStarted}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              marginTop: 48,
              width: 'min(340px, 80vw)',
              height: 88,
              padding: 2,
              border: 'none',
              borderRadius: 22,
              background: 'linear-gradient(90deg, #2BA8FF, #A14FFF)',
              cursor: 'pointer',
              transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: hovered ? '0 0 40px rgba(90,140,255,0.25)' : '0 0 0 rgba(90,140,255,0)',
              transition: 'transform 200ms ease, box-shadow 200ms ease',
              animation: 'welcomeFadeUp 700ms ease 200ms both',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                borderRadius: 20,
                background: 'rgba(18,20,35,0.85)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                color: '#FFFFFF',
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              Get started
              <ArrowRight size={24} color="#A04DFF" />
            </div>
          </button>

          <div
            style={{
              position: 'absolute',
              bottom: 28,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              opacity: Math.max(0, 0.5 - sinkProgress),
              transition: 'opacity 200ms ease',
            }}
          >
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Scroll to learn more</span>
            <ChevronDown size={16} color="rgba(255,255,255,0.7)" style={{ animation: 'welcomeBreathe 2.5s ease-in-out infinite' }} />
          </div>
        </div>
      </div>

      {/* НИЖЕ ГЕРОЯ — обычный поток, при скролле наезжает поверх sticky-фона */}
      <div style={{ position: 'relative', zIndex: 2, background: '#05060D' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '96px 24px 64px' }}>
          <RevealOnScroll>
            <h2
              style={{
                fontSize: 'clamp(28px, 4vw, 40px)',
                fontWeight: 700,
                color: '#FFFFFF',
                textAlign: 'center',
                marginBottom: 16,
                letterSpacing: '-0.02em',
              }}
            >
              What is Ahova?
            </h2>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.7,
                color: 'rgba(255,255,255,0.65)',
                textAlign: 'center',
                maxWidth: 640,
                margin: '0 auto 64px',
              }}
            >
              Ahova is an infrastructure observability platform. Connect a lightweight agent
              to any server and get real-time metrics, Docker container control, and security
              scanning — without setting up Prometheus, Grafana, or anything else first.
            </p>
          </RevealOnScroll>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 32 }}>
            {[
              { icon: <Activity size={22} />, title: 'Real-time metrics', desc: 'CPU, memory, disk and network — live, with history and trends.' },
              { icon: <Container size={22} />, title: 'Docker under control', desc: 'Start, stop, restart, inspect logs and manage containers directly.' },
              { icon: <ShieldCheck size={22} />, title: 'Security built in', desc: 'CIS Docker Benchmark scans and compliance checks, on demand.' },
            ].map((f, i) => (
              <RevealOnScroll key={f.title} delay={i * 120}>
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <div style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: 12, background: 'rgba(139,92,246,0.12)', alignItems: 'center', justifyContent: 'center', color: '#A04DFF', marginBottom: 16 }}>
                    {f.icon}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF', marginBottom: 8 }}>{f.title}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.55)' }}>{f.desc}</div>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>

        <footer
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            padding: '32px 24px',
            textAlign: 'center',
            fontSize: 13,
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          Ahova © 2026. All rights reserved.
        </footer>
      </div>
    </div>
  )
}
