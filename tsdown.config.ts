import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  deps: {
    onlyBundle: ['@ntnyq/utils'],
  },
  dts: true,
  entry: {
    index: 'src/index.ts',
    stream: 'src/stream.ts',
  },
  minify: 'dce-only',
  platform: 'browser',
  target: ['chrome87', 'edge88', 'firefox78', 'safari14'],
})
