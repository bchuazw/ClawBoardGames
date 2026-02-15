'use client';

import { useEffect } from 'react';

const BG_VOLUME = 0.05;

export function BackgroundMusic() {
  useEffect(() => {
    const audio = new Audio('/bg-music.mp3');
    audio.loop = true;
    audio.volume = BG_VOLUME;

    const tryPlay = () => {
      audio.play().catch(() => {});
    };

    tryPlay();

    const onInteraction = () => {
      tryPlay();
      document.removeEventListener('click', onInteraction);
      document.removeEventListener('keydown', onInteraction);
      document.removeEventListener('touchstart', onInteraction);
    };
    document.addEventListener('click', onInteraction, { once: true });
    document.addEventListener('keydown', onInteraction, { once: true });
    document.addEventListener('touchstart', onInteraction, { once: true });

    return () => {
      audio.pause();
      document.removeEventListener('click', onInteraction);
      document.removeEventListener('keydown', onInteraction);
      document.removeEventListener('touchstart', onInteraction);
    };
  }, []);

  return null;
}
