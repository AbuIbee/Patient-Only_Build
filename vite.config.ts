import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// MMA-PROF-ONBOARD-004 P0-1 -- root cause of the blank /Professional/Owner
// (and every other deep-linked route) page: with a relative base, the
// built index.html's asset <script>/<link> src are "./assets/...",
// which a browser resolves against the CURRENT document URL rather than
// site root. On a direct deep link or reload at any non-root path,
// vercel.json's catch-all SPA rewrite ("/((?!assets/).*) -> /index.html")
// then ALSO intercepts the resulting mis-resolved asset request (e.g.
// "/Professional/assets/index-*.js", which does not start with
// "assets/" at the root) and answers it with index.html's own bytes --
// a text/html response for a <script type="module">, which every
// browser refuses to execute under strict MIME-type checking. React
// never mounts; #root stays permanently empty. Reproduced with a
// faithful local simulator of the real vercel.json rewrite rule against
// the real `dist/` build (see MMA-PROF-ONBOARD-004_IMPLEMENTATION_REPORT.md).
// capacitor.config.ts's `server.url` points the packaged Android app at
// the real hosted https://www.mymemoriaally.com rather than a local
// bundled copy of webDir, so this fix carries no Capacitor-local-file
// regression risk -- the shipped app resolves assets exactly like a
// mobile browser visiting the real site.
export default defineConfig({
  base: '/',
  plugins: [
    inspectAttr(),
    react(),
    {
      name: 'haneen-enterprise-html-branding',
      // Static build-time HTML branding is required for browser titles,
      // favicon, and crawlers; React-only title changes arrive too late.
      // The patient site keeps its original index.html unchanged.
      transformIndexHtml(html) {
        if (process.env.VITE_ENTERPRISE_SITE !== 'true') return html;
        return html
          .replace('<title>My Memoria Ally</title>', '<title>Haneen Care Network | Where Compassion Connects Care</title>')
          .replace('href="/images/MymemoriaDayTime.png"', 'href="/haneen-favicon.svg"')
          .replace('content="#C9A87C"', 'content="#071A3A"')
          .replace('content="My Memoria Ally - Designed to support Dementia Care, ADHD, Autism, Anxiety, Traumatic Brain Injury, and other cognitive support needs."', 'content="Haneen Care Network connects organizations, caregivers, patients, and authorized healthcare specialists in one coordinated care platform."')
          .replace('</head>', '    <meta property="og:title" content="Haneen Care Network" />\n    <meta property="og:description" content="Where Compassion Connects Care." />\n    <meta property="og:type" content="website" />\n  </head>');
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
