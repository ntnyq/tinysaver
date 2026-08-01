<script setup lang="ts">
import CanvasSaveDemo from './components/CanvasSaveDemo.vue'
import JsonSaveDemo from './components/JsonSaveDemo.vue'
import StreamSaveDemo from './components/StreamSaveDemo.vue'
import TextSaveDemo from './components/TextSaveDemo.vue'
</script>

<template>
  <div class="min-h-screen bg-canvas px-4 py-6 sm:px-6 sm:py-9">
    <main class="mx-auto max-w-[1180px]">
      <header
        class="playground-header mb-7 grid gap-5 border-b-2 border-ink pb-7 md:grid-cols-[1.25fr_0.75fr] md:items-end"
      >
        <div>
          <div class="mb-4 flex items-center gap-3">
            <span
              class="brand-mark grid h-9 w-9 place-items-center rounded-[0.35rem] border-2 border-ink bg-coral text-base font-900 text-white"
              aria-hidden="true"
            >
              ↓
            </span>
            <span
              class="font-mono text-[0.7rem] font-750 tracking-[0.1em] text-ink"
            >
              TINYSAVER / BROWSER FILE LAB
            </span>
          </div>
          <h1
            class="m-0 max-w-[760px] font-display text-[clamp(2.45rem,5.4vw,4.5rem)] leading-[0.95] tracking-[-0.055em] text-ink"
          >
            Browser file lab.
          </h1>
        </div>
        <div class="md:pb-1">
          <p class="m-0 max-w-[430px] text-base leading-7 text-muted">
            Edit a sample, save the result. Nothing leaves this browser tab.
          </p>
          <div
            class="format-rail mt-5 grid h-2 grid-cols-4 overflow-hidden rounded-[2px] border border-ink"
            aria-hidden="true"
          >
            <span class="format-segment bg-coral" />
            <span class="format-segment bg-primary" />
            <span class="format-segment bg-success" />
            <span class="format-segment bg-lemon" />
          </div>
        </div>
      </header>

      <section
        class="demo-grid grid gap-5 lg:auto-rows-fr lg:grid-cols-2"
        aria-label="tinysaver examples"
      >
        <TextSaveDemo />
        <JsonSaveDemo />
        <CanvasSaveDemo />
        <StreamSaveDemo />
      </section>
    </main>
  </div>
</template>

<style scoped>
.brand-mark {
  box-shadow: 3px 3px 0 #f6cb45;
}

.format-rail > .format-segment + .format-segment {
  border-left: 1px solid #10231d;
}
</style>
