'use client';

import { useRef, useState, useEffect, type ReactNode } from 'react';

type Direction = 'left' | 'right' | 'up';

interface ScrollRevealProps {
  children: ReactNode;
  direction?: Direction;
  delay?: number;
  once?: boolean;
  fadePast?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const getInitialTransform = (direction: Direction): string => {
  switch (direction) {
    case 'left': return 'translateX(-56px)';
    case 'right': return 'translateX(56px)';
    case 'up': return 'translateY(40px)';
    default: return 'translateY(24px)';
  }
};

export function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  once = true,
  fadePast = false,
  className,
  style,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;
        if (entry.isIntersecting) setVisible(true);
        else if (once) return;
        else setVisible(false);
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    const pastObserver = fadePast
      ? new IntersectionObserver(
          (entries) => {
            const [entry] = entries;
            if (!entry) return;
            if (entry.isIntersecting) setPast(false);
            else if (entry.boundingClientRect.top < 0) setPast(true);
          },
          { threshold: 0, rootMargin: '-15% 0px -15% 0px' }
        )
      : null;

    observer.observe(el);
    if (pastObserver) pastObserver.observe(el);
    return () => {
      observer.disconnect();
      pastObserver?.disconnect();
    };
  }, [once, fadePast]);

  const initialTransform = getInitialTransform(direction);
  const visibleTransform = past && fadePast ? 'translateY(0) scale(0.98)' : 'translateX(0) translateY(0)';
  const opacity = !visible ? 0 : past && fadePast ? 0.35 : 1;
  const transform = visible ? visibleTransform : initialTransform;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity,
        transform,
        transition: `opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms, transform 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
