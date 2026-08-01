import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [presetWind3()],
  shortcuts: {
    'action-button':
      'inline-flex min-h-11 items-center justify-center rounded-[0.6rem] border-2 border-primary bg-primary px-4 text-sm font-750 text-white transition-[transform,box-shadow,background-color,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink hover:bg-primaryDark hover:shadow-[3px_3px_0_#10231d] active:translate-x-0 active:translate-y-0 active:shadow-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-primary/30 disabled:cursor-not-allowed disabled:transform-none disabled:border-line disabled:bg-line disabled:text-muted disabled:shadow-none',
    'control-field':
      'w-full rounded-[0.6rem] border-2 border-line bg-paper px-3.5 py-3 text-sm text-ink outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-primary focus:bg-white focus:ring-3 focus:ring-primary/12',
    'control-label':
      'mb-2 block text-[0.67rem] font-750 uppercase tracking-[0.12em] text-muted',
    'demo-panel':
      'relative flex h-full flex-col rounded-[0.8rem] border-2 border-line bg-paper p-5 sm:p-6',
    'file-preview':
      'overflow-hidden rounded-[0.6rem] border-2 border-line bg-paperSoft',
    'secondary-button':
      'inline-flex min-h-11 items-center justify-center rounded-[0.6rem] border-2 border-line bg-white px-4 text-sm font-750 text-ink transition-[transform,box-shadow,border-color,color] duration-200 hover:-translate-y-0.5 hover:border-ink hover:text-primary hover:shadow-[0_3px_0_#10231d] active:translate-y-0 active:shadow-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-primary/30',
  },
  theme: {
    colors: {
      canvas: '#dcebe5',
      coral: '#ff5a3d',
      danger: '#d93d57',
      ink: '#10231d',
      lemon: '#f6cb45',
      line: '#a9beb6',
      muted: '#5c6f68',
      paper: '#fcfefd',
      paperSoft: '#edf5f2',
      primary: '#175cff',
      primaryDark: '#0d3fcc',
      success: '#008a68',
    },
    fontFamily: {
      body: "'Avenir Next', 'Segoe UI', sans-serif",
      display: "'Arial Black', 'Avenir Next', sans-serif",
      mono: "'SFMono-Regular', Consolas, monospace",
    },
  },
})
