import { useState, useEffect, useRef } from 'react';

/**
 * Animates from 0 to target number over duration when value appears or changes.
 * @param {number} target - Final value
 * @param {number} durationMs - Animation duration in ms
 * @param {boolean} enabled - Whether to run animation (e.g. when in view)
 * @returns {number} Current value for display
 */
export function useAnimatedNumber(target, durationMs = 1200, enabled = true) {
  const [current, setCurrent] = useState(0);
  const startRef = useRef(null);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
    let rafId = null;

    const tick = (timestamp) => {
      if (startRef.current == null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const easeOut = 1 - (1 - progress) ** 2;
      setCurrent(numTarget * easeOut);
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    if (!enabled) {
      rafId = requestAnimationFrame(() => {
        setCurrent(typeof target === 'number' ? target : 0);
      });
      return () => rafId && cancelAnimationFrame(rafId);
    }
    const numTarget = Number(target);
    if (Number.isNaN(numTarget)) {
      rafId = requestAnimationFrame(() => setCurrent(0));
      return () => rafId && cancelAnimationFrame(rafId);
    }
    startRef.current = null;
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [target, enabled, durationMs]);

  return current;
}
