import { RainField } from "./RainField";

export function MoonlitScene({
  active,
  quiet,
}: {
  active: boolean;
  quiet: boolean;
}) {
  return (
    <div
      className="pc-scene"
      aria-hidden="true"
      data-active={active ? "true" : "false"}
      data-quiet={quiet ? "true" : "false"}
    >
      <div className="pc-scene__sky" />
      <div className="pc-scene__haze" />
      <svg
        className="pc-scene__layer pc-scene__moon"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="pc-lunar-disc" cx="35%" cy="30%">
            <stop stopColor="#fff9e5" />
            <stop offset=".74" stopColor="#e5e2cd" />
            <stop offset="1" stopColor="#c7d3c8" />
          </radialGradient>
        </defs>
        <circle cx="1175" cy="244" r="49" fill="url(#pc-lunar-disc)" />
        <path
          d="M1154 215q-18 13-8 30t4 27q13 16 31 9-21-3-15-19t-5-26q-9-12-7-21"
          className="pc-scene__moon-shade"
        />
        <circle cx="1192" cy="226" r="6" className="pc-scene__moon-shade" />
      </svg>
      <svg
        className="pc-scene__layer pc-scene__ridge pc-scene__ridge--far"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="pc-distant-wash" x2="0" y2="1">
            <stop stopColor="#36585e" />
            <stop offset="1" stopColor="#233f46" />
          </linearGradient>
        </defs>
        <path
          fill="url(#pc-distant-wash)"
          d="M-40 550Q38 529 95 481L146 452Q157 420 176 410L196 424 221 402Q241 406 260 452L289 470Q318 458 346 487L391 531Q444 539 481 492L519 459 540 467Q552 446 564 444L591 467Q637 495 673 512L715 498Q742 488 762 453L782 432 793 410 809 398 824 407Q843 437 857 440L882 479Q917 495 937 470L963 445 985 450 1005 428 1024 438 1047 468Q1082 506 1120 487L1149 453 1165 458Q1190 443 1212 400L1230 385 1247 344 1257 339 1271 355 1282 350 1303 384 1321 395Q1334 428 1360 444L1393 470 1480 436V900H-40Z"
        />
        <g fill="none" stroke="#a3bab0" strokeWidth="1" opacity=".18">
          <path d="M1257 339l-18 70-24 24-18 47m60-121 8 49 30 26 17 36M809 398l-10 49-26 35m36-67 17 41 23 13M196 424l10 41 35 36M985 450l-17 34-28 17" />
        </g>
      </svg>
      <div className="pc-scene__mist pc-scene__mist--high" />
      <svg
        className="pc-scene__layer pc-scene__ridge pc-scene__ridge--mid"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="pc-middle-wash" x2=".2" y2="1">
            <stop stopColor="#34595f" />
            <stop offset="1" stopColor="#152f38" />
          </linearGradient>
        </defs>
        <path
          fill="url(#pc-middle-wash)"
          d="M-40 670L4 644 32 611 55 607 81 568 97 559 122 520 140 517 163 484 177 488 192 522 215 538 229 565 254 579Q274 580 294 605L336 613 379 633Q447 662 526 622L572 601 604 605 641 581Q676 574 708 590L757 622Q792 636 837 616L884 592 915 595 944 571 968 574 989 552 1009 562 1035 590Q1090 620 1125 584L1153 564 1182 551 1201 513 1222 500 1242 465 1258 461 1275 431 1292 439 1305 476 1327 489 1344 529 1381 552 1403 584 1480 560V900H-40Z"
        />
        <g fill="none" stroke="#71918d" opacity=".2" strokeWidth="1.2">
          <path d="M1275 439l-17 59-19 19-19 48m64-107 12 47 23 27 5 41M163 491l-18 44-29 28-15 39m62-87 11 37 27 22M989 558l-12 32-35 26M641 585l-15 28-33 17" />
        </g>
      </svg>
      <div className="pc-scene__mist pc-scene__mist--low" />
      <svg
        className="pc-scene__layer pc-scene__ridge pc-scene__ridge--near"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <path d="M-40 740Q30 686 70 650L111 636 138 606 155 610 178 585 192 591 213 633Q252 652 286 696L320 711Q402 717 479 750L572 773Q639 785 712 803L755 825H-40ZM1480 644L1439 627 1412 596 1394 603 1371 567 1359 564 1343 582 1329 619 1306 636 1283 682Q1248 705 1212 720L1160 756 1096 778 1003 802 961 824H1480Z" />
        <g stroke="#0d252c" strokeWidth="3" fill="#0d252c">
          <path
            d="M1372 608l-2-98m0 29 24-17m-24 33-31-12m30-16-17-10"
            fill="none"
          />
          <path d="M1380 519q21-15 35 0-21 5-35 0m-46 22q20-14 37 0-19 7-37 0m8-26q10-14 28-4-14 8-28 4m15-10q13-15 26-1-11 5-26 1" />
        </g>
      </svg>
      <div className="pc-scene__water">
        <div className="pc-scene__glint pc-scene__glint--a" />
        <div className="pc-scene__glint pc-scene__glint--b" />
      </div>
      <svg
        className="pc-scene__layer pc-scene__boat"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <g transform="translate(1036 742)" fill="#102b32">
          <path d="M-40 0Q0 12 49-3L35 9Q-4 18-32 7Z" />
          <path d="M-14 1Q-7-19 16-11L28 4Z" />
          <path
            d="M-22 0l-1-25m-5 5 44 38"
            fill="none"
            stroke="#102b32"
            strokeWidth="2"
          />
          <circle cx="-23" cy="-28" r="3" />
          <path
            d="M-32 28Q0 32 39 25m-61 12 41-3"
            fill="none"
            stroke="#8aa6a0"
            strokeWidth=".8"
            opacity=".35"
          />
        </g>
      </svg>
      <RainField active={active} quiet={quiet} />
      <svg
        className="pc-scene__eaves"
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id="pc-roof-tiles"
            width="38"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 0v10q19 8 38 0V0"
              fill="#12252b"
              stroke="#385052"
              strokeWidth=".7"
            />
          </pattern>
        </defs>
        <path d="M0 0H1440V17Q1380 36 1330 22H110Q54 36 0 17Z" fill="#0a1c24" />
        <path
          d="M0 0H1440V9Q1380 27 1330 14H110Q54 27 0 9Z"
          fill="url(#pc-roof-tiles)"
        />
        <path
          d="M0 19Q54 37 110 24H1330Q1380 38 1440 20"
          fill="none"
          stroke="#7c8676"
          strokeWidth="1"
          opacity=".55"
        />
        <path d="M26 26v40m1388-39v39" stroke="#7c8676" opacity=".45" />
      </svg>
      <div className="pc-scene__post pc-scene__post--left" />
      <div className="pc-scene__post pc-scene__post--right" />
    </div>
  );
}
