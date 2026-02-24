import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  entry: ['src/index.ts'],
  inlineOnly: ['@ntnyq/utils'],
  platform: 'browser',
  minify: 'dce-only',
  dts: {
    tsgo: true,
  },
})
