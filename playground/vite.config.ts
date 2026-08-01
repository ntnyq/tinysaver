import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    Vue(),

    UnoCSS({
      inspector: false,
    }),
  ],
  resolve: {
    alias: [
      {
        find: 'tinysaver/stream',
        replacement: fileURLToPath(
          new URL('../src/stream.ts', import.meta.url),
        ),
      },
      {
        find: 'tinysaver',
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
    ],
  },
})
