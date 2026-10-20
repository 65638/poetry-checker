import { useEffect, useRef } from 'react';

interface MoonlitSceneProps {
  /** Effective motion: user/system preference resolved by the caller. */
  active: boolean;
  /** Lower emphasis while typing, composing, or with the dialog open. */
  quiet: boolean;
}

const HALO_TAU_MS = 80;
const SCENE_TAU_MS = 260;
const SETTLE_AFTER_MS = 900;
const RIPPLE_GAP_MS = 250;
const RIPPLE_MAX = 2;
const RIPPLE_LIFE_MS = 1400;
const EPSILON = 0.002;
const INTERACTIVE =
  'button, a, input, textarea, select, label, summary, [role="dialog"], [contenteditable], .pc-surface';

export function MoonlitScene({ active, quiet }: MoonlitSceneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const ripplesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const halo = haloRef.current;
    const ripples = ripplesRef.current;
    if (!root || !halo || !ripples) return;

    const syncHidden = () => {
      if (document.hidden) root.setAttribute('data-paused', 'true');
      else root.removeAttribute('data-paused');
    };
    syncHidden();
    document.addEventListener('visibilitychange', syncHidden);

    if (!active) {
      root.style.setProperty('--pc-px', '0');
      root.style.setProperty('--pc-py', '0');
      halo.removeAttribute('data-visible');
      return () => document.removeEventListener('visibilitychange', syncHidden);
    }

    let width = window.innerWidth;
    let height = window.innerHeight;
    let frame = 0;
    let last = 0;
    let lastMove = 0;
    let lastRipple = -Infinity;
    let pointerX = width / 2;
    let pointerY = height / 2;
    let haloX = pointerX;
    let haloY = pointerY;
    let targetPx = 0;
    let targetPy = 0;
    let px = 0;
    let py = 0;
    const timers = new Set<number>();

    const write = () => {
      root.style.setProperty('--pc-px', px.toFixed(4));
      root.style.setProperty('--pc-py', py.toFixed(4));
      halo.style.transform = `translate3d(${haloX.toFixed(1)}px, ${haloY.toFixed(1)}px, 0)`;
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;
      if (now - lastMove > SETTLE_AFTER_MS) {
        targetPx = 0;
        targetPy = 0;
      }
      const kHalo = 1 - Math.exp(-dt / HALO_TAU_MS);
      const kScene = 1 - Math.exp(-dt / SCENE_TAU_MS);
      haloX += (pointerX - haloX) * kHalo;
      haloY += (pointerY - haloY) * kHalo;
      px += (targetPx - px) * kScene;
      py += (targetPy - py) * kScene;
      write();
      const settled =
        Math.abs(pointerX - haloX) < 0.3 &&
        Math.abs(pointerY - haloY) < 0.3 &&
        Math.abs(targetPx - px) < EPSILON &&
        Math.abs(targetPy - py) < EPSILON &&
        now - lastMove > SETTLE_AFTER_MS;
      if (settled) {
        frame = 0;
        last = 0;
        root.removeAttribute('data-pointer');
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
    };

    const hideHalo = () => {
      halo.removeAttribute('data-visible');
      lastMove = 0;
      wake();
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') {
        hideHalo();
        return;
      }
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!halo.hasAttribute('data-visible')) {
        haloX = pointerX;
        haloY = pointerY;
        halo.setAttribute('data-visible', 'true');
      }
      targetPx = (pointerX / width) * 2 - 1;
      targetPy = (pointerY / height) * 2 - 1;
      lastMove = performance.now();
      root.setAttribute('data-pointer', 'true');
      wake();
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      const target = event.target as Element | null;
      if (target && target.closest(INTERACTIVE)) return;
      const now = performance.now();
      if (now - lastRipple < RIPPLE_GAP_MS) return;
      lastRipple = now;
      while (ripples.childElementCount >= RIPPLE_MAX && ripples.firstElementChild) {
        ripples.firstElementChild.remove();
      }
      const ripple = document.createElement('span');
      ripple.className = 'pc-scene__ripple';
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      ripples.appendChild(ripple);
      const timer = window.setTimeout(() => {
        ripple.remove();
        timers.delete(timer);
      }, RIPPLE_LIFE_MS);
      timers.add(timer);
    };

    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) hideHalo();
    };

    const onResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
    };

    const onVisibility = () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerout', onOut);
    window.addEventListener('blur', hideHalo);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerout', onOut);
      window.removeEventListener('blur', hideHalo);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('visibilitychange', syncHidden);
      if (frame) cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      ripples.replaceChildren();
      halo.removeAttribute('data-visible');
      root.removeAttribute('data-pointer');
    };
  }, [active]);

  return (
    <div
      ref={rootRef}
      className="pc-scene"
      aria-hidden="true"
      data-active={active ? 'true' : 'false'}
      data-quiet={quiet ? 'true' : 'false'}
    >
      <div className="pc-scene__sky" />
      <div className="pc-scene__haze" />
      <svg className="pc-scene__layer pc-scene__moon" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <circle cx="1080" cy="190" r="58" />
        <circle className="pc-scene__moon-shade" cx="1062" cy="176" r="12" />
        <circle className="pc-scene__moon-shade" cx="1100" cy="214" r="7" />
      </svg>
      <svg className="pc-scene__layer pc-scene__ridge pc-scene__ridge--far" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-40 560 L90 498 L180 520 L300 452 L410 500 L520 470 L640 520 L760 440 L880 492 L990 462 L1120 512 L1240 456 L1350 500 L1480 470 L1480 900 L-40 900 Z" />
      </svg>
      <div className="pc-scene__mist pc-scene__mist--high" />
      <svg className="pc-scene__layer pc-scene__ridge pc-scene__ridge--mid" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-40 640 L60 590 L170 616 L260 560 L380 610 L470 584 L600 632 L700 572 L830 618 L960 580 L1060 626 L1180 568 L1300 612 L1480 580 L1480 900 L-40 900 Z" />
      </svg>
      <div className="pc-scene__mist pc-scene__mist--low" />
      <svg className="pc-scene__layer pc-scene__ridge pc-scene__ridge--near" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-40 700 L120 664 L240 684 L360 648 L520 690 L640 670 L780 698 L920 660 L1060 692 L1200 668 L1340 694 L1480 676 L1480 900 L-40 900 Z" />
      </svg>
      <div className="pc-scene__water">
        <div className="pc-scene__glint pc-scene__glint--a" />
        <div className="pc-scene__glint pc-scene__glint--b" />
      </div>
      <div ref={ripplesRef} className="pc-scene__ripples" />
      <div ref={haloRef} className="pc-scene__halo" />
    </div>
  );
}