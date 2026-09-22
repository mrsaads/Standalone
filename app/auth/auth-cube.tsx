"use client";

// Decorative rotating cube for the auth pages (login/signup/reset), matching what's actually live
// on resend.com (checked directly): one rigid, always-solved cube tumbling continuously through 3D
// space. Rebuilt a second time to fix a real structural problem in the first pass: that version was
// a single 3x3 SLAB (one unit deep) rather than an actual cube, so at certain points in the tumble
// it foreshortened down to a paper-thin card instead of reading as solid. A real cube can never do
// that — some face is always presented with real width, because there's real volume behind it.
//
// So this is a proper 6-faced cube (front/back/left/right/top/bottom, each positioned in 3D via
// translateZ + rotate from the cube's own center) with a 3x3 grid drawn on every face via a plain
// 2D CSS grid of 9 cells — no nested 3D transforms below the face level, which sidesteps both real
// bugs the first build tripped on (flex flattening preserve-3d children; `filter` forcing preserve-
// 3d to compute as `flat`). Each face gets its own shading (lighter top, darker bottom/sides) for a
// believable single-light-source read, same idea as before, just applied per-face instead of per-
// tiny-cubie.
//
// Purely decorative: aria-hidden, pointer-events: none, never between the pointer and the form.
// prefers-reduced-motion freezes it at a fixed angled pose in auth-cube.css rather than removing it
// or collapsing it flat.
const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const FACES = ["front", "back", "right", "left", "top", "bottom"] as const;

export function AuthCube() {
  return (
    <div className="ix-cube-stage" aria-hidden="true">
      <div className="ix-cube-rig">
        {FACES.map(face => (
          <div key={face} className={`ix-cube-face ix-cube-face-${face}`}>
            {CELLS.map(cell => <span key={cell} className="ix-cube-cell" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
