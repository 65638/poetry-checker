/** The room frames the persistent moon and garden; the open window is never repainted. */
export function LibraryRoom() {
  return (
    <div className="pc-library-room">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pc-room-wall" x2="1" y2=".5">
            <stop stopColor="#172b30" />
            <stop offset=".55" stopColor="#1f3030" />
            <stop offset="1" stopColor="#10252c" />
          </linearGradient>
          <linearGradient id="pc-room-wood">
            <stop stopColor="#18272a" />
            <stop offset=".5" stopColor="#4e5145" />
            <stop offset=".65" stopColor="#77705a" />
            <stop offset="1" stopColor="#1c2e30" />
          </linearGradient>
          <linearGradient id="pc-room-floor" x2="0" y2="1">
            <stop stopColor="#203336" stopOpacity="0" />
            <stop offset="1" stopColor="#122226" />
          </linearGradient>
          <radialGradient id="pc-lamp-light">
            <stop stopColor="#e2bc75" stopOpacity=".2" />
            <stop offset="1" stopColor="#e2bc75" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pc-lamp-paper" x2="1" y2=".3">
            <stop stopColor="#8e7d55" />
            <stop offset=".5" stopColor="#d5bd83" />
            <stop offset="1" stopColor="#796e4e" />
          </linearGradient>
          <pattern
            id="pc-room-grain"
            width="29"
            height="270"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M5 0q-5 60 1 115t-2 155M18 0q6 92 0 174t3 96"
              stroke="#8a8d72"
              opacity=".035"
              fill="none"
            />
          </pattern>
          <g id="pc-bound-volumes">
            <path
              d="M0 0h104v15H0Zm5-15h92V0H5Zm-3-14h96v14H2Z"
              fill="#263d3f"
              stroke="#738073"
              strokeWidth=".7"
            />
            <path
              d="M8-25h78m-74 5h72M12-10h74M9 5h84m-84 5h84M8-29v44m7-44v44"
              fill="none"
              stroke="#b0aa88"
              strokeWidth=".5"
              opacity=".55"
            />
            <path d="M62-25h23v9H62Z" fill="#c2b898" opacity=".6" />
          </g>
        </defs>
        {/* An asymmetric room: shelves at the edges, an open lake window on the right. */}
        <path d="M0 0H1440V90H920V470H1440V900H0Z" fill="url(#pc-room-wall)" />
        <path d="M0 0H1440V90H920V470H1440V900H0Z" fill="url(#pc-room-grain)" />
        <rect
          x="920"
          y="90"
          width="520"
          height="380"
          fill="none"
          stroke="#718479"
          strokeWidth="2"
        />
        <path
          d="M908 78h532v12H920v380h520v12H908Z"
          fill="url(#pc-room-wood)"
        />
        <path
          d="M928 98h512M928 458h512M940 102v350m-13-250h25m-25 110h25M1330 98v360M1337 98v360M1340 125h100m-100 28h100m-100 270h100m-100 28h100"
          stroke="#829083"
          opacity=".42"
          fill="none"
        />
        <path
          d="M1348 102h84v46h-84Zm0 326h84v23h-84ZM925 463h515v7H925Z"
          fill="#263d3e"
          stroke="#6d7b6f"
          strokeWidth=".7"
        />
        <path d="M0 106h900M0 110h900" stroke="#83816b" opacity=".2" />
        <g opacity=".75">
          <path
            d="M12 320h112v468H12Zm1300 352h116v436h-116Z"
            fill="#102226"
            stroke="#59655a"
          />
          {[446, 600, 754].map((y) => (
            <g key={y}>
              <rect
                x="10"
                y={y}
                width="116"
                height="9"
                fill="url(#pc-room-wood)"
              />
              <use
                href="#pc-bound-volumes"
                transform={`translate(18 ${y - 18}) scale(.88)`}
              />
              <path
                d={`M22 ${y - 78}h17v48H22Zm20-4h12v52H42Zm16 5h11v47H58Z`}
                fill="#4b5950"
                stroke="#8b8f76"
                strokeWidth=".5"
              />
            </g>
          ))}
          {[480, 616, 752].map((y) => (
            <g key={y}>
              <rect
                x="1298"
                y={y}
                width="132"
                height="9"
                fill="url(#pc-room-wood)"
              />
              <use
                href="#pc-bound-volumes"
                transform={`translate(1310 ${y - 18})`}
              />
            </g>
          ))}
        </g>
        <rect y="580" width="1440" height="320" fill="url(#pc-room-floor)" />
        <g className="pc-library-room__shadow" fill="#0d2228" opacity=".55">
          <path
            d="M1410 450q-44-150-94-276m53 141-48-23m23-42 25-40m-47-7-49-27"
            fill="none"
            stroke="#0d2228"
            strokeWidth="3"
          />
          <path d="M1365 311q-38-40-72-32 24 21 72 32m-22-59q-4-48 28-66-1 34-28 66m-25-39q-44-36-69-19 30 18 69 19m64 145q-46-12-73 11 42 4 73-11Z" />
        </g>
        <g className="pc-library-room__lamp">
          <ellipse
            cx="1328"
            cy="226"
            rx="150"
            ry="155"
            fill="url(#pc-lamp-light)"
          />
          <path d="M1328 82v59" stroke="#afa681" strokeWidth="1" />
          <path
            d="M1307 146h42l13 27v65l-13 21h-42l-13-21v-65Z"
            fill="url(#pc-lamp-paper)"
            stroke="#9b956e"
          />
          <path
            d="M1307 146h42m-51 29h60m-60 61h60m-51 23h42M1308 149l-5 85 6 22m39-107 5 85-6 22m-19-107v107"
            fill="none"
            stroke="#615d46"
            strokeWidth="1"
            opacity=".7"
          />
          <path d="M1314 140h28v6h-28Zm0 119h28v5h-28Z" fill="#34413a" />
          <path
            d="M1328 264v19m-5 0h10l-2 35h-6Z"
            fill="#968b66"
            stroke="#968b66"
          />
        </g>
        <path
          d="M12 812H1428M20 824H1420M30 850H1410"
          stroke="#75806b"
          opacity=".13"
          fill="none"
        />
      </svg>
    </div>
  );
}
