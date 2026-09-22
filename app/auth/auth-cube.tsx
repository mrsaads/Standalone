"use client";

// Decorative rotating cube for the auth pages (login/signup/reset). Rebuilt to match what's
// actually live on resend.com after directly re-checking it (screenshots a few seconds apart): one
// rigid, always-solved cube that tumbles continuously through 3D space — not individual sections
// scrambling apart and re-converging, which is what an earlier pass of this built from the written
// brief's wording before the live reference was re-checked and turned out not to match it. This is
// an original CSS-3D build (plain divs, custom properties, keyframes, Improvexus's own grayscale
// palette) — no image, canvas, or WebGL asset, and none of Resend's own textures or exact motion.
//
// Structure: a 3x3 grid of "cubies" (one visible layer of the classic Rubik's-cube look), each with
// 3 shaded faces (front/top/side) for a believable single-light-source read at this size. The whole
// assembly rotates on all three axes at once, each axis completing a different whole number of full
// turns over the same duration — that's what makes the tumble look complex/non-repeating instead of
// a flat spin, while still looping perfectly seamlessly (every axis is back at a multiple of 360deg
// at the same instant).
//
// Purely decorative: aria-hidden, pointer-events: none, never between the pointer and the form.
// prefers-reduced-motion freezes it at a fixed angled pose in auth-cube.css rather than removing it
// or collapsing it flat.
export function AuthCube() {
  const rows = [0, 1, 2];
  const cols = [0, 1, 2];
  return (
    <div className="ix-cube-stage" aria-hidden="true">
      <div className="ix-cube-rig">
        {rows.map(row => (
          <div key={row} className="ix-cube-row" style={{ "--cubie-row": row } as React.CSSProperties}>
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
