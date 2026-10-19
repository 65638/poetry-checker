// Decorative only: the whole stage art is aria-hidden and ignores pointer events.
export function InkStage() {
  return (
    <div className="pc-stage__art" aria-hidden="true">
      <span className="pc-stage__glyph">诗</span>
      <svg
        className="pc-stage__mountains"
        viewBox="0 0 1440 420"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <circle className="pc-ink-sun" cx="1180" cy="118" r="44" />
        <g className="pc-ink-layer pc-ink-layer--far">
          <path d="M0 262 Q 70 220 140 236 T 280 196 Q 340 150 410 178 T 560 160 Q 640 120 720 170 T 880 150 Q 950 96 1030 140 T 1190 150 Q 1270 116 1340 170 T 1440 160 V420 H0 Z" />
        </g>
        <g className="pc-ink-layer pc-ink-layer--mist">
          <path d="M150 240 H360 M820 212 H1010 M1240 196 H1400 M420 286 H640" />
        </g>
        <g className="pc-ink-layer pc-ink-layer--mid">
          <path d="M0 330 Q 100 280 200 300 T 400 270 Q 470 236 560 280 T 760 290 Q 850 240 940 268 T 1120 250 Q 1210 220 1300 270 T 1440 262 V420 H0 Z" />
        </g>
        <g className="pc-ink-layer pc-ink-layer--near">
          <path d="M0 384 Q 120 344 260 362 T 520 350 Q 640 320 760 356 T 1000 344 Q 1120 310 1240 350 T 1440 340 V420 H0 Z" />
        </g>
      </svg>
    </div>
  );
}
