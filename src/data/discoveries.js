// Private, unlisted "Website Discovery" forms — one per prospective client.
// Each entry here becomes its own page at /discovery/<slug>/, built from the
// SAME template (styling, field names, Netlify Forms bucket) so adding a new
// discovery for a future lead is just adding a new object to this array and
// pushing. Nothing here is linked from the site nav or the sitemap, and the
// page itself is marked noindex — the link is private by not being findable,
// not by a login, so only share it directly with the client it's for.
//
// Submissions all land in one Netlify Forms bucket named "discovery" (Site
// settings -> Forms in the Netlify dashboard), tagged with `client_slug` so
// they're easy to tell apart. Turn on Netlify's email notification for that
// form once and every submission also lands in your inbox.

export const DISCOVERIES = [
  {
    slug: "lola",
    active: true,
    // Shown in the page title/head only — keep it generic, not the client's name,
    // since this link may be forwarded.
    clientContext: "for a body butter & scrub brand",
    discountPercent: 30,
    discountLabel: "Founding rate",
    basics: [
      { name: "business_name", label: "Business name", placeholder: "" },
      { name: "product_line", label: "What do you sell? (product line, quick overview)", placeholder: "" },
      { name: "sell_where", label: "Where do you sell now?", placeholder: "Etsy, Instagram, markets, nowhere yet" },
      { name: "domain", label: "Do you already own a domain name?", placeholder: "" },
    ],
    assets: [
      { name: "logo", label: "Logo", placeholder: "yes / no / needs one" },
      { name: "colors", label: "Brand colors", placeholder: "yes / no" },
      { name: "photos", label: "Product photography", placeholder: "yes / no / how many products" },
      { name: "descriptions", label: "Product descriptions & ingredients written up", placeholder: "yes / no" },
    ],
    tiers: [
      {
        key: "showcase",
        label: "Option A",
        name: "Showcase Site",
        desc: "A beautiful one-page site — your story, your products, real photos. Visitors DM you or shop through wherever you already sell.",
        priceLow: 800,
        priceHigh: 1200,
      },
      {
        key: "storefront",
        label: "Option B",
        name: "Full Storefront",
        desc: "A real online store — browse, add to cart, and check out right on your own site. Built on a proper e-commerce platform.",
        priceLow: 2000,
        priceHigh: 3500,
        plus: true,
      },
    ],
    costs: [
      { what: "Domain name", cost: "~$15–20 / year", note: "Registered once a year, separate from the build." },
      { what: "Hosting / platform", cost: "Free–ish (Showcase) · ~$29–79/mo (Storefront)", note: "Storefront runs on a commerce platform like Shopify or Squarespace." },
      { what: "Payment processing", cost: "~2.9% + $0.30 / sale", note: "Storefront only. Goes to Stripe/Shopify Payments, not to No Empty Chair." },
      { what: "Email / newsletter tool", cost: "Free–$20 / mo", note: "Optional. Depends on list size." },
    ],
  },
];

export function getDiscovery(slug) {
  return DISCOVERIES.find((d) => d.slug === slug && d.active !== false);
}
