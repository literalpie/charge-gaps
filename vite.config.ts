import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tailwindcss from '@tailwindcss/vite'

import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

import solidPlugin from 'vite-plugin-solid'
import netlify from '@netlify/vite-plugin-tanstack-start'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    netlify(),
    tailwindcss(),
    tanstackStart(),
    solidPlugin({ ssr: true }),
  ],
})
