// Decorative background artwork for the auth screens — the soft draped-fabric light in the
// supplied reference, rebuilt as inline SVG rather than a photograph.
//
// Why SVG and not the reference's own image: a photographic silk render is a few hundred KB that
// has to download before the login page looks finished, and it cannot recolour. This is a handful
// of curved paths behind two Gaussian blurs — it paints in the same frame as the rest of the page,
// weighs nothing, scales to any viewport without resampling, and its light level is a stop value
// we can tune instead of a fixed pixel.
//
// The read it is going for: one broad fold sweeping in from the top-right with a brighter crease
// along its leading edge, a second tighter fold just inside it, and a quiet counter-light in the
// bottom-left — the same diagonal balance as the reference, so the centred card sits in the dark
// middle with light falling away on both corners.
//
// `preserveAspectRatio="xMidYMid slice"` makes it behave like a background-size: cover image: it
// always fills the viewport and crops rather than letterboxing, at any window shape.
//
// Purely decorative: aria-hidden, focusable={false} (IE/Edge used to put SVGs in the tab order),
// and pointer-events are disabled in CSS so it can never sit between the pointer and the form.
export function AuthWave() {
  return (
    <svg
      className="ix-auth-wave"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Brightest along the top-right, falling to nothing by the lower-left — this gradient is
            what makes the shape read as a lit surface rather than a flat grey blob. */}
        <linearGradient id="ixw-fold-a" x1="100%" y1="0%" x2="18%" y2="88%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.30" />
          <stop offset="34%" stopColor="#c4c4cb" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="ixw-fold-b" x1="92%" y1="8%" x2="12%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.20" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="ixw-counter" x1="0%" y1="100%" x2="75%" y2="15%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* The blurs do the real work. Generous filter regions so the blur is never clipped at the
            shape's bounding box, which would leave a visible hard edge. */}
        <filter id="ixw-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="24" />
        </filter>
        <filter id="ixw-softest" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="52" />
        </filter>
      </defs>

      <g filter="url(#ixw-soft)">
        {/* Main fold: enters above the top-right corner, sweeps down and left, exits at the bottom. */}
        <path
          d="M1500,-60 C1210,30 920,200 720,415 C575,570 480,720 425,960 L1500,960 Z"
          fill="url(#ixw-fold-a)"
        />
        {/* Inner fold, offset from the first so their edges form the crease between them. */}
        <path
          d="M1500,140 C1270,215 1060,340 915,495 C800,620 730,760 700,960 L1500,960 Z"
          fill="url(#ixw-fold-b)"
        />
      </g>

      {/* Counter-light in the opposite corner, blurred much harder so it reads as ambient bounce
          rather than as a second object. */}
      <g filter="url(#ixw-softest)">
        <path d="M-120,960 L-120,600 C130,680 330,810 470,960 Z" fill="url(#ixw-counter)" />
      </g>
    </svg>
  );
}
