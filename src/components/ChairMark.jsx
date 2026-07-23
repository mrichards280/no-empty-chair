import React from "react";
import { LOGO_VIEWBOX, LOGO_RATIO, LOGO_INNER_TRANSFORM, CHAIR_PATH, ORB_PATH } from "../lib/logoPaths.js";

// The No Empty Chair brand mark, for the React islands (radar popup, teardown).
// `size` is the HEIGHT — the mark is portrait, so width follows the ratio.
// `stroke` colors the chair line, `orb` colors the seat orb.
export function ChairMark({ size = 58, orb = "#a85a76", stroke = "#413645" }) {
  const width = Math.round(size * LOGO_RATIO * 100) / 100;
  return (
    <svg
      width={width}
      height={size}
      viewBox={LOGO_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="No Empty Chair mark"
    >
      <g fill={stroke} stroke="none">
        <g transform={LOGO_INNER_TRANSFORM}>
          <path d={CHAIR_PATH} />
        </g>
      </g>
      <g className="nec-orb">
        <g transform={LOGO_INNER_TRANSFORM}>
          <path d={ORB_PATH} fill={orb} />
        </g>
      </g>
    </svg>
  );
}

export default ChairMark;
