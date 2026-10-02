import { ImageResponse } from "next/og";

// The card shown when a page from this site is shared (WhatsApp, LinkedIn, X, Slack). Drawn in
// code rather than shipped as a file, so it can never fall out of step with the brand.
export const alt = "Improvexus, an Upwork bidding agency";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(140deg, #0b0b0d 0%, #060607 55%, #17171a 100%)", color: "#f5f5f6" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, border: "2px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }}>I</div>
          <div style={{ fontSize: 26, letterSpacing: 8, fontWeight: 700 }}>IMPROVEXUS</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Upwork bidding agency</div>
          <div style={{ fontSize: 32, color: "#9a9aa3", lineHeight: 1.35, maxWidth: 940 }}>A dedicated Upwork bidder, a profile audit and a weekly report on your account.</div>
        </div>
        <div style={{ fontSize: 22, color: "#6f6f76", letterSpacing: 4 }}>INNOVATE. OPTIMIZE. EXCEL.</div>
      </div>
    ),
    size,
  );
}
