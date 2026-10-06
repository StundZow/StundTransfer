// StundTransfer: bigger interface on large screens. Mantine sizes everything in
// rem (text, fields, buttons, spacing, container widths), so scaling the root
// font size scales the whole page together and keeps the side margins.
// 16px up to a 1600px wide window, then +1px every 240px, up to 20px (+25%)
// at 2560px. Phones and laptops are unchanged.
import { Global } from "@mantine/core";

const ResponsiveScale = () => (
  <Global
    styles={{
      html: { fontSize: "clamp(16px, calc(9.333px + 0.4167vw), 20px)" },
    }}
  />
);

export default ResponsiveScale;
