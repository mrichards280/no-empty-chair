// Sanitizes admin-editable rich-text fields (from public/content.json) before
// they're rendered with `set:html`. Runs at build time only (Astro frontmatter),
// so it never ships to the client bundle. The admin editor only ever needs
// links, line breaks, and light emphasis — anything else is stripped.
import sanitizeHtml from "sanitize-html";

const OPTIONS = {
  allowedTags: ["a", "br", "b", "strong", "em", "i"],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["https", "mailto", "tel"],
  allowProtocolRelative: false,
};

export function sanitizeRichText(html) {
  return sanitizeHtml(html || "", OPTIONS);
}
