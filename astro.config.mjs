import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Static output: every page is prerendered to complete HTML at build time so
// AI crawlers and search engines read the full copy. React is available for the
// few genuinely-interactive islands (contact form, radar popup, teardown, admin).
export default defineConfig({
  output: 'static',
  site: 'https://noemptychair.co',
  integrations: [react()],
});
