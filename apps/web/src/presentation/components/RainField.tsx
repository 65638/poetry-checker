import { useEffect, useRef } from "react";

// The scene has one bounded canvas loop. React never receives particle/pointer state.
interface Drop {
  x: number;
  y: number;
  vx: number;
  speed: number;
  depth: number;
  floor: number;
}
interface Ring {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  deliberate: boolean;
}
const SHELTER =
  'button, a, input, textarea, select, label, summary, [role="dialog"], [contenteditable], .pc-plinth, .pc-rail, .pc-hall--reading .pc-manuscript, .pc-masthead, .pc-colophon, .pc-evidence, .pc-dictionary__desk, .pc-dictionary__folio, .pc-dictionary__masthead, .pc-places';
const MAX_RINGS = 24;

export function RainField({
  active,
  quiet,
}: {
  active: boolean;
  quiet: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quietRef = useRef(quiet);
  quietRef.current = quiet;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;
    const scene = canvas.closest<HTMLElement>(".pc-scene, .pc-garden");
    const fine = window.matchMedia(
      "(any-hover: hover) and (any-pointer: fine)",
    );
    const forced = window.matchMedia("(forced-colors: active)");
    let width = 0,
      height = 0,
      frame = 0,
      last = 0,
      time = 0;
    let blurred = false,
      lastImpact = 0,
      lastClick = -Infinity;
    let drops: Drop[] = [];
    const rings: Ring[] = [];
    const pointer = { x: 0, y: 0, vx: 0, at: -Infinity, visible: false };
    let breeze = 0;
    let rainGain = quietRef.current ? 0.24 : 1;
    let lastHoverRipple = -Infinity;
    let hoverX = 0,
      hoverY = 0;
    const isWater = (x: number, y: number) => {
      const depth = (y / height - 0.74) / 0.26;
      return (
        depth >= 0 &&
        x > width * (0.4 + depth * 0.1) &&
        x < width * (0.89 - depth * 0.2)
      );
    };
    const reset = (drop: Drop, initial = false) => {
      drop.x = Math.random() * (width + 100) - 50;
      drop.y = initial ? Math.random() * height : -30 - Math.random() * 140;
      drop.depth = Math.random();
      drop.speed = 210 + drop.depth * 290;
      drop.vx = -26;
      const waterY = height * (0.77 + Math.random() * 0.19);
      drop.floor = isWater(drop.x, waterY) ? waterY : height + 50;
    };
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(
        width < 600 ? 90 : 250,
        Math.max(65, Math.round((width * height) / 5300)),
      );
      drops = Array.from({ length: count }, () => {
        const drop = { x: 0, y: 0, vx: 0, speed: 0, depth: 0, floor: 0 };
        reset(drop, true);
        return drop;
      });
      rings.length = 0;
    };
    const addRing = (
      x: number,
      y: number,
      deliberate: boolean,
      wake = false,
    ) => {
      if (rings.length >= MAX_RINGS) rings.shift();
      rings.push({
        x,
        y,
        age: 0,
        life: deliberate ? 1.7 : wake ? 1.5 : 1.15,
        size: deliberate ? 70 : wake ? 38 : 11 + Math.random() * 13,
        deliberate,
      });
    };
    const clearPointer = () => {
      pointer.visible = false;
      pointer.at = -Infinity;
      pointer.vx = 0;
      canvas.removeAttribute("data-reacting");
    };
    const allowed = () =>
      active &&
      !document.hidden &&
      !blurred &&
      !forced.matches &&
      !canvas.closest("[hidden]");

    const draw = (now: number) => {
      frame = 0;
      if (!allowed()) return;
      // Cap paint work at 60Hz even on high-refresh displays / headless browsers.
      if (last && now - last < 1000 / 60 - 0.5) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const dt = last ? Math.min((now - last) / 1000, 0.04) : 1 / 60;
      last = now;
      time += dt;
      ctx.clearRect(0, 0, width, height);
      // Ease both directions without resetting drops or rings on state changes.
      rainGain +=
        ((quietRef.current ? 0.24 : 1) - rainGain) * (1 - Math.exp(-dt * 2.8));
      const gain = rainGain;
      const wind =
        -25 + Math.sin(time * 0.35) * 14 + Math.sin(time * 0.11) * 12;
      const wake = pointer.visible
        ? Math.exp(-Math.max(0, now - pointer.at - 80) / 340)
        : 0;
      const windTarget = pointer.vx * wake;
      breeze += (windTarget - breeze) * (1 - Math.exp(-dt * 5));
      if (wake < 0.015) canvas.removeAttribute("data-reacting");
      const radius = 118 + Math.min(52, Math.abs(breeze) * 0.035);
      for (const drop of drops) {
        const dx = drop.x - pointer.x,
          dy = (drop.y - pointer.y) * 1.15;
        const distance = Math.hypot(dx, dy);
        const nearby = pointer.visible ? Math.max(0, 1 - distance / radius) : 0;
        const force = nearby * nearby;
        // A still pointer shelters a small opening; movement adds a fading gust.
        const bend = force * ((dx < 0 ? -1 : 1) * 260 + breeze * 0.45);
        const targetVx = wind * (0.5 + drop.depth) + bend;
        drop.vx += (targetVx - drop.vx) * (1 - Math.exp(-dt * 8));
        drop.x += drop.vx * dt;
        drop.y += drop.speed * (1 - force * 0.38) * dt;
        if (drop.y > drop.floor || drop.x < -80 || drop.x > width + 80) {
          if (
            isWater(drop.x, drop.y) &&
            time - lastImpact > 0.35 - gain * 0.22
          ) {
            addRing(drop.x, drop.y, false);
            lastImpact = time;
          }
          reset(drop);
        }
        const length = 8 + drop.depth * 20;
        // Let the opening words breathe: rain is present, but quieter behind the title.
        const inTitle =
          drop.x > width * 0.3 &&
          drop.x < width * 0.76 &&
          drop.y > height * 0.14 &&
          drop.y < height * 0.62;
        ctx.strokeStyle = `rgba(199,221,218,${(0.13 + drop.depth * 0.25) * gain * (inTitle ? 0.46 : 1) * (1 - force * 0.55)})`;
        ctx.lineWidth = 0.55 + drop.depth * 0.5;
        ctx.beginPath();
        ctx.moveTo(drop.x - drop.vx * 0.04, drop.y - length);
        ctx.quadraticCurveTo(
          drop.x - drop.vx * 0.018 - bend * 0.018,
          drop.y - length * 0.48,
          drop.x,
          drop.y,
        );
        ctx.stroke();
      }
      // Eave drips: a slower, heavier rhythm at the two edges of the shelter.
      for (let i = 0; i < 3; i++) {
        const phase = (time + i * 1.17) % 3.9;
        if (phase > 1.45) continue;
        const x = i === 0 ? 28 : width - (i === 1 ? 30 : 47);
        const y = 24 + 0.5 * 880 * phase * phase;
        ctx.strokeStyle = `rgba(207,224,215,${0.4 * gain})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y - 7 - phase * 13);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]!;
        ring.age += dt;
        if (ring.age > ring.life) {
          rings.splice(i, 1);
          continue;
        }
        const progress = ring.age / ring.life;
        const radius = 2 + ring.size * (1 - (1 - progress) ** 2);
        ctx.strokeStyle = `rgba(184,211,208,${(1 - progress) * (ring.deliberate ? 0.55 : 0.28) * gain})`;
        ctx.lineWidth = ring.deliberate ? 0.9 : 0.65;
        ctx.beginPath();
        ctx.ellipse(ring.x, ring.y, radius, radius * 0.23, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (ring.deliberate && progress > 0.15) {
          ctx.beginPath();
          ctx.ellipse(
            ring.x,
            ring.y,
            radius * 0.66,
            radius * 0.15,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
      }
      // Distant scenery responds a few pixels to the same gust, with no luminous follower.
      scene?.style.setProperty(
        "--pc-px",
        Math.max(-1, Math.min(1, breeze / 900)).toFixed(3),
      );
      frame = requestAnimationFrame(draw);
    };
    const sync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      const running = allowed();
      canvas.dataset.running = String(running);
      scene?.toggleAttribute("data-paused", !running);
      if (running) frame = requestAnimationFrame(draw);
      else {
        clearPointer();
        breeze = 0;
        scene?.style.setProperty("--pc-px", "0");
        if (!active || forced.matches) ctx.clearRect(0, 0, width, height);
      }
    };
    const onMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        !allowed() ||
        event.pointerType !== "mouse" ||
        !fine.matches ||
        !target?.closest(".pc-root") ||
        target.closest(SHELTER) ||
        window.getSelection()?.toString()
      ) {
        clearPointer();
        return;
      }
      const now = performance.now();
      if (
        isWater(event.clientX, event.clientY) &&
        now - lastHoverRipple > 180 &&
        Math.hypot(event.clientX - hoverX, event.clientY - hoverY) > 22
      ) {
        addRing(event.clientX, event.clientY, false, true);
        lastHoverRipple = now;
        hoverX = event.clientX;
        hoverY = event.clientY;
      }
      pointer.vx = pointer.visible
        ? Math.max(
            -1500,
            Math.min(
              1500,
              (event.clientX - pointer.x) /
                Math.max(0.016, (now - pointer.at) / 1000),
            ),
          )
        : 0;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.at = now;
      pointer.visible = true;
      canvas.dataset.reacting = "true";
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        clearPointer();
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (
        !allowed() ||
        !fine.matches ||
        event.button !== 0 ||
        !target?.closest(".pc-root") ||
        target.closest(SHELTER) ||
        window.getSelection()?.toString() ||
        !isWater(event.clientX, event.clientY)
      )
        return;
      const now = performance.now();
      if (now - lastClick < 250) return;
      lastClick = now;
      // At most two deliberate rings, independently of the bounded rain impacts.
      const clicks = rings.filter((ring) => ring.deliberate);
      if (clicks.length >= 2) rings.splice(rings.indexOf(clicks[0]!), 1);
      addRing(event.clientX, event.clientY, true);
    };
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) clearPointer();
    };
    const onBlur = () => {
      blurred = true;
      sync();
    };
    const onFocus = () => {
      blurred = false;
      sync();
    };
    // A mounted checker retains its draft/report while the user visits the
    // dictionary. Pause its canvas while that region is hidden, then resume.
    const region = canvas.closest(".pc-place");
    const regionObserver = region ? new MutationObserver(sync) : null;
    if (region)
      regionObserver?.observe(region, {
        attributes: true,
        attributeFilter: ["hidden"],
      });
    resize();
    sync();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointercancel", clearPointer);
    window.addEventListener("scroll", clearPointer, {
      passive: true,
      capture: true,
    });
    document.addEventListener("pointerout", onOut);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", sync);
    forced.addEventListener("change", sync);
    fine.addEventListener("change", clearPointer);
    return () => {
      regionObserver?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointercancel", clearPointer);
      window.removeEventListener("scroll", clearPointer, true);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", sync);
      forced.removeEventListener("change", sync);
      fine.removeEventListener("change", clearPointer);
      canvas.dataset.running = "false";
      clearPointer();
      ctx.clearRect(0, 0, width, height);
    };
  }, [active]);
  return <canvas ref={canvasRef} className="pc-rain" aria-hidden="true" />;
}
