import React, { ReactNode, useRef, useEffect, useState } from 'react';

interface GradientCardProps {
  children: ReactNode;
  colorScheme: 'green' | 'blue' | 'purple' | 'yellow' | 'violet';
  className?: string;
}

export const GradientCard: React.FC<GradientCardProps> = ({ 
  children, 
  colorScheme, 
  className = '' 
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Преобразуем в процентны координаты
      const xPercent = (x / rect.width) * 100;
      const yPercent = (y / rect.height) * 100;
      
      setMousePosition({ x: xPercent, y: yPercent });
      
      // Устанавливаем CSS переменные
      card.style.setProperty('--mouse-x', `${xPercent}%`);
      card.style.setProperty('--mouse-y', `${yPercent}%`);
    };

    const handleMouseEnter = () => {
      if (card) {
        card.addEventListener('mousemove', handleMouseMove);
      }
    };

    const handleMouseLeave = () => {
      if (card) {
        card.removeEventListener('mousemove', handleMouseMove);
      }
    };

    card.addEventListener('mouseenter', handleMouseEnter);
    card.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      card.removeEventListener('mouseenter', handleMouseEnter);
      card.removeEventListener('mouseleave', handleMouseLeave);
      card.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className={`gradient-card hover-${colorScheme} ${className}`}
      style={{
        '--mouse-x': '0%',
        '--mouse-y': '0%',
      } as React.CSSProperties & { '--mouse-x': string; '--mouse-y': string }}
    >
      {children}
    </div>
  );
};
