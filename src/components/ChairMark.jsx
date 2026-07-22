import React from "react";

// The filled-chair brand mark. stroke uses the passed color; orb is the rose dot.
// Shared by the hero (via ChairMark.astro), the radar popup, and the teardown page.
export function ChairMark({ size = 58, orb = "#a85a76", stroke = "#413645" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="No Empty Chair mark">
      <g fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M45 40 L21 40 L21 20 Q21 15 26 15" />
        <path d="M44 40 L46 55" />
        <path d="M22 40 L20 55" />
      </g>
      <circle cx="31" cy="29" r="8.5" fill={orb} />
    </svg>
  );
}

export default ChairMark;
