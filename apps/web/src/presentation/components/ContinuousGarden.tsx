import { RainField } from "./RainField";

// One 2,880-unit drawing: the pavilion and library share an unbroken shoreline.
// The sky/moon are outside this moving drawing, with one persistent rain field.
export function ContinuousGarden({
  place,
  active,
  quiet,
}: {
  place: "checker" | "dictionary";
  active: boolean;
  quiet: boolean;
}) {
  return (
    <div
      className="pc-scene pc-continuous"
      data-place={place}
      data-active={active}
      data-quiet={quiet}
      aria-hidden="true"
    >
      <div className="pc-continuous__sky" />
      <div className="pc-continuous__moon">
        <svg viewBox="0 0 120 120">
          <defs>
            <radialGradient id="pc-shared-moon" cx="35%" cy="30%">
              <stop stopColor="#fff9e5" />
              <stop offset=".74" stopColor="#e5e2cd" />
              <stop offset="1" stopColor="#c7d3c8" />
            </radialGradient>
          </defs>
          <circle cx="60" cy="60" r="49" fill="url(#pc-shared-moon)" />
          <g fill="#97afaa" opacity=".13">
            <path d="M39 31q-18 13-8 30t4 27q13 16 31 9-21-3-15-19t-5-26q-9-12-7-21" />
            <circle cx="77" cy="42" r="6" />
            <circle cx="89" cy="72" r="9" />
          </g>
        </svg>
      </div>
      <div className="pc-continuous__panorama">
        <svg
          className="pc-continuous__drawing"
          viewBox="0 0 2880 900"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="pc-scroll-far" x2="0" y2="1">
              <stop stopColor="#36585e" />
              <stop offset="1" stopColor="#233f46" />
            </linearGradient>
            <linearGradient id="pc-scroll-mid" x2=".2" y2="1">
              <stop stopColor="#34595f" />
              <stop offset="1" stopColor="#152f38" />
            </linearGradient>
            <linearGradient id="pc-scroll-water" x2="0" y2="1">
              <stop stopColor="#24434a" stopOpacity="0" />
              <stop offset="1" stopColor="#18323a" />
            </linearGradient>
            <linearGradient id="pc-scroll-wood">
              <stop stopColor="#0c2027" />
              <stop offset=".65" stopColor="#1f3439" />
              <stop offset=".8" stopColor="#3a4745" />
              <stop offset="1" stopColor="#13292f" />
            </linearGradient>
            <pattern
              id="pc-scroll-tiles"
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
            <pattern
              id="pc-scroll-lattice"
              width="54"
              height="80"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 0h54v80H0ZM27 0v80M0 40h54M14 20h26v40H14Z"
                fill="none"
                stroke="#658078"
                strokeWidth="1.3"
              />
            </pattern>
            <g id="pc-pine-crown">
              <path d="M-42 0q18-23 48-12 25-11 42 7-45 17-90 5M-28-20q19-22 47-12 23-3 31 12-33 9-78 0" />
              <path
                d="M-35 4q33 8 76-5"
                fill="none"
                stroke="#526961"
                strokeWidth=".7"
              />
            </g>
          </defs>
          <path
            fill="url(#pc-scroll-far)"
            d="M-40 550Q38 529 95 481L146 452Q157 420 176 410L196 424 221 402Q241 406 260 452L289 470Q318 458 346 487L391 531Q444 539 481 492L519 459 540 467Q552 446 564 444L591 467Q637 495 673 512L715 498Q742 488 762 453L782 432 793 410 809 398 824 407Q843 437 857 440L882 479Q917 495 937 470L963 445 985 450 1005 428 1024 438 1047 468Q1082 506 1120 487L1149 453 1165 458Q1190 443 1212 400L1230 385 1247 344 1257 339 1271 355 1282 350 1303 384 1321 395Q1334 428 1360 444L1393 470 1440 450Q1490 429 1524 454L1568 477 1610 469 1645 439 1672 421 1690 392 1706 399 1734 361 1747 350 1765 378 1780 369 1801 412 1830 434Q1875 463 1920 443L1960 407 1985 413 2014 382 2035 389 2060 428Q2100 455 2140 429L2170 394 2200 378 2217 345 2230 356 2245 321 2257 330 2280 376 2304 394 2329 431Q2370 455 2410 439L2440 412 2464 418 2490 389 2510 399 2533 436Q2580 469 2620 451L2656 430 2690 444 2730 418 2760 432 2800 472 2880 457V900H-40Z"
          />
          <g fill="none" stroke="#a3bab0" strokeWidth="1" opacity=".18">
            <path d="M1257 339l-18 70-24 24-18 47m60-121 8 49 30 26 17 36M809 398l-10 49-26 35m36-67 17 41 23 13M196 424l10 41 35 36M985 450l-17 34-28 17M1747 350l-12 65-34 40-10 33m62-116 17 51 24 27M2245 321l-19 70-17 16-19 53m62-119 17 53 21 22 8 41M2490 389l-18 47-31 23M2014 382l-16 46-22 18" />
          </g>
          <path
            fill="url(#pc-scroll-mid)"
            d="M-40 670L4 644 32 611 55 607 81 568 97 559 122 520 140 517 163 484 177 488 192 522 215 538 229 565 254 579Q274 580 294 605L336 613 379 633Q447 662 526 622L572 601 604 605 641 581Q676 574 708 590L757 622Q792 636 837 616L884 592 915 595 944 571 968 574 989 552 1009 562 1035 590Q1090 620 1125 584L1153 564 1182 551 1201 513 1222 500 1242 465 1258 461 1275 431 1292 439 1305 476 1327 489 1344 529 1381 552 1403 584 1440 574Q1485 562 1520 586L1560 604 1600 588 1629 552 1647 548 1666 512 1681 501 1700 517 1725 557Q1775 590 1820 571L1858 540 1880 545 1910 512 1931 525 1960 568Q2010 598 2060 568L2090 534 2110 537 2140 498 2160 483 2180 499 2204 551Q2240 580 2280 568L2320 541 2350 548 2380 518 2400 532 2430 584Q2480 616 2530 580L2565 549 2580 555 2610 524 2630 536 2664 582Q2710 610 2770 583L2810 562 2880 592V900H-40Z"
          />
          <g fill="none" stroke="#71918d" opacity=".22" strokeWidth="1.2">
            <path d="M1275 439l-17 59-19 19-19 48m64-107 12 47 23 27 5 41M163 491l-18 44-29 28-15 39m62-87 11 37 27 22M989 558l-12 32-35 26M641 585l-15 28-33 17M1681 501l-20 51-28 20-12 33m65-90 9 40 22 26M2160 483l-17 55-26 28m48-65 21 54 18 12M2380 518l-21 51-28 21M2610 524l-15 44-27 23" />
          </g>
          <path
            fill="#142c32"
            d="M-40 740Q30 686 70 650L111 636 138 606 155 610 178 585 192 591 213 633Q252 652 286 696L320 711Q402 717 479 750L572 773Q639 785 712 803L755 825H-40ZM961 824L1096 778 1160 756Q1248 705 1283 682L1306 636 1329 619 1343 582 1359 564 1371 567 1394 603 1412 596 1440 627Q1490 660 1550 680L1610 697Q1670 733 1720 748L1790 790 1840 824ZM2230 825Q2320 789 2400 771L2490 725 2534 692 2551 656 2568 649 2586 668 2604 705Q2670 746 2730 748L2810 773 2880 762V900H2230Z"
          />
          <rect
            y="730"
            width="2880"
            height="170"
            fill="url(#pc-scroll-water)"
          />
          <g fill="none" stroke="#91aaa2" opacity=".2" strokeWidth=".8">
            <path d="M690 851h109m24 0h48m34 13h155m62 0h92m-432 16h212M1690 843h120m45 13h164m40-13h78m-258 37h183m48-12h89M2320 866h131m51 14h124" />
            <path d="M735 837h55m235 45h61m-13-39h50M1870 827h70m130 45h110M2420 849h79" />
          </g>
          <g fill="#0d252c" stroke="#0d252c">
            <path
              d="M1372 647l-2-137m0 29 24-17m-24 33-31-12m30-16-17-10"
              strokeWidth="3"
              fill="none"
            />
            <use
              href="#pc-pine-crown"
              transform="translate(1372 520) scale(.55)"
            />
            <use
              href="#pc-pine-crown"
              transform="translate(1344 545) scale(.45)"
            />
            <path
              d="M2546 704q14-54 5-115m0 32-40-19m41 0 26-19m-26 71 39-15"
              strokeWidth="4"
              fill="none"
            />
            <use
              href="#pc-pine-crown"
              transform="translate(2558 586) scale(.7)"
            />
            <use
              href="#pc-pine-crown"
              transform="translate(2507 600) scale(.6)"
            />
            <use
              href="#pc-pine-crown"
              transform="translate(2584 638) scale(.5)"
            />
          </g>
          <g transform="translate(1036 742)" fill="#102b32">
            <path d="M-40 0Q0 12 49-3L35 9Q-4 18-32 7ZM-14 1Q-7-19 16-11L28 4Z" />
            <path
              d="M-22 0l-1-25m-5 5 44 38"
              fill="none"
              stroke="#102b32"
              strokeWidth="2"
            />
            <circle cx="-23" cy="-28" r="3" />
            <path
              d="M-32 28Q0 32 39 25m-61 12 41-3"
              stroke="#8aa6a0"
              fill="none"
              opacity=".35"
            />
          </g>
          <g className="pc-continuous__bridge" fill="none" stroke="#67827c">
            <path
              d="M1780 739Q1870 644 1960 739M1791 742Q1870 675 1949 742"
              strokeWidth="5"
            />
            <path
              d="M1780 726Q1870 631 1960 726M1797 711v21m20-37v20m22-31v20m23-24v20m23-19v20m23-15v20m22-10v20m18-4v20"
              strokeWidth="2"
            />
            <path d="M1802 767q68 45 137 0m-102 21q30 10 60 0" opacity=".15" />
          </g>
          <g
            transform="translate(2375 666)"
            stroke="#71877d"
            strokeWidth=".8"
            fill="#183139"
          >
            <path d="M-53-55q53 20 106 0l-18 15h-70Z" fill="#10262e" />
            <path d="M-62-57q23-1 33-10l29-11 29 11q10 9 33 10-66 12-124 0Z" />
            <path
              d="M-33-40v58m66-58v58M-35 18h70M-40 23h80M-45 28h90M-26-39v43h52v-43"
              fill="none"
            />
          </g>
          <g className="pc-continuous__bamboo" fill="#10282e" stroke="#223d40">
            <path
              d="M2750 900q-18-240 22-518m-20 246-57-56m60 4 72-51m-60-25-55-63m54 6 40-67"
              fill="none"
              strokeWidth="5"
            />
            <path
              d="M2758 508h13m-17 68h13m-21 68h15m-20 69h15"
              fill="none"
              stroke="#728677"
              strokeWidth="2"
              opacity=".6"
            />
            {[
              "translate(2695 572) rotate(15)",
              "translate(2827 525) rotate(174)",
              "translate(2712 437) rotate(20)",
              "translate(2806 409) rotate(164)",
            ].map((t) => (
              <g key={t} transform={t} className="pc-continuous__leaves">
                <path d="M0 0Q-42-33-83-22Q-39-4 0 0ZM0 0Q-24 6-65 43Q-26 30 0 0ZM0 0Q-8-44 15-64Q16-22 0 0ZM0 0Q21-28 59-32Q36-8 0 0ZM0 0Q28 9 47 44Q14 23 0 0Z" />
              </g>
            ))}
          </g>
        </svg>
        <svg
          className="pc-continuous__architecture"
          viewBox="0 0 2880 900"
          preserveAspectRatio="none"
        >
          <path
            d="M0 0H2880V22Q2800 38 2740 24H1440Q1380 36 1330 22H110Q54 36 0 17Z"
            fill="#0a1c24"
          />
          <path
            d="M0 0H2880V12Q2800 29 2740 16H1440Q1380 27 1330 14H110Q54 27 0 9Z"
            fill="url(#pc-scroll-tiles)"
          />
          <path
            d="M0 19Q54 37 110 24H1330Q1380 38 1440 24H2740Q2800 40 2880 24"
            fill="none"
            stroke="#7c8676"
            opacity=".55"
          />
          {[0, 1428, 2868].map((x) => (
            <rect
              key={x}
              x={x}
              y="24"
              width="12"
              height="876"
              fill="url(#pc-scroll-wood)"
            />
          ))}
          <path
            d="M1440 32h1440v46H1440Z"
            fill="#142b32"
            stroke="#495b56"
            strokeWidth="1"
          />
          <path
            d="M1456 43h1408v23H1456ZM1456 54h1408"
            fill="none"
            stroke="#69756a"
            opacity=".4"
          />
          <rect
            x="1440"
            y="78"
            width="67"
            height="650"
            fill="#152d34"
            fillOpacity=".65"
          />
          <rect
            x="2813"
            y="78"
            width="67"
            height="650"
            fill="#152d34"
            fillOpacity=".65"
          />
          <rect
            x="1448"
            y="87"
            width="50"
            height="632"
            fill="url(#pc-scroll-lattice)"
            opacity=".6"
          />
          <rect
            x="2822"
            y="87"
            width="50"
            height="632"
            fill="url(#pc-scroll-lattice)"
            opacity=".6"
          />
          <path
            d="M1440 729h80v12h-80m1373-12h67v12h-67"
            stroke="#768074"
            fill="#263b3b"
          />
          <g
            transform="translate(2790 778)"
            fill="#1c3035"
            stroke="#829080"
            strokeWidth="1"
          >
            <path d="M-44 0h84v15h-84ZM-38-15h85V0h-85ZM-41-30h79v15h-79Z" />
            <path
              d="M-31-25h52m-55 4h56m-51 11h61m-66 5h64M-31 5h58m-60 5h60"
              opacity=".4"
            />
            <path d="M-36-31v46m8-46v46" opacity=".5" />
          </g>
          <g transform="translate(2760 78)">
            <g className="pc-continuous__chime">
              <path d="M0 0v63" stroke="#8c9680" fill="none" />
              <path
                d="M-15 80q2-19 15-19t15 19Z"
                fill="#556c64"
                stroke="#afae8c"
                strokeWidth=".8"
              />
              <path d="M0 79v20" stroke="#a3a78b" />
              <circle cy="87" r="2" fill="#b9b08c" />
              <path d="M-7 98h14v43l-7-3-7 3Z" fill="#b4b79b" opacity=".65" />
              <path d="M0 105v22" stroke="#536f67" />
            </g>
          </g>
        </svg>
      </div>
      <div className="pc-scene__mist pc-scene__mist--high" />
      <div className="pc-scene__mist pc-scene__mist--low" />
      <div className="pc-scene__water">
        <div className="pc-scene__glint pc-scene__glint--a" />
        <div className="pc-scene__glint pc-scene__glint--b" />
      </div>
      <RainField active={active} quiet={quiet} />
    </div>
  );
}
