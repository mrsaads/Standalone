"use client";

// Decorative rotating "self-solving" cube for the auth pages (login/signup/reset). This is an
// original CSS-3D build inspired by the *idea* of a scrambling/solving cube the user referenced —
// not a copy of any third party's art, textures, or exact motion: it's plain divs, CSS custom
// properties, and keyframes, carrying Improvexus's own grayscale palette.
//
// Structure: three horizontal "layers" (rows) of 3 cubies each, like the rows of a Rubik's cube.
// Each layer spins on its own axis (X / Y / Z) on its own timer. Because all three timers share
// the same duration and start of cycle, they pass back through 0deg (= aligned = "solved") at the
// same instant once per loop, hold there briefly, then diverge into the next scramble — so it
// reads as independent sections turning and periodically snapping into a solved arrangement, not
// one solid object spinning. The whole assembly also slowly orbits on Y so it reads as a 3D object
// rather than a flat panel.
//
// Purely decorative: aria-hidden, pointer-events: none, and it never sits between the pointer and
// the form. prefers-reduced-motion is handled entirely in auth-cube.css (freezes every layer at
// its "solved" identity transform instead of removing the element, so the static fallback still
// looks like a cube, just a still one).
export function AuthCube() {
  const layers = [0, 1, 2];
  const cols = [0, 1, 2];
  return (
    <div className="ix-cube-stage" aria-hidden="true">
      <div className="ix-cube-orbit">
        {layers.map(layer => (
          <div key={layer} className={`ix-cube-layer ix-cube-layer-${layer}`}>
            {cols.map(col => (
              <div key={col} className="ix-cubie" style={{ "--cubie-col": col } as React.CSSProperties}>
                <span className="ix-cubie-face ix-cubie-front" />
                <span className="ix-cubie-face ix-cubie-top" />
                <span className="ix-cubie-face ix-cubie-side" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
