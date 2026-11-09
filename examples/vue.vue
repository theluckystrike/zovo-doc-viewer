<!--
  Vue 3. Tell the compiler that zovo-* tags are custom elements (vite.config.js):
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('zovo-') } } })
  and load the element once, for example in index.html:
    <script type="module" src="https://cdn.jsdelivr.net/gh/theluckystrike/zovo-doc-viewer@v0.1.0/dist/zovo-doc-viewer.js"></script>
-->
<script setup>
import { ref } from 'vue';

const viewer = ref(null);
const info = ref('');

function pick(e) {
  const f = e.target.files[0];
  if (f) viewer.value.load(f);
}
</script>

<template>
  <input type="file" @change="pick">
  <zovo-doc-viewer
    ref="viewer"
    src="/files/report.xlsx"
    theme="auto"
    style="height: 600px"
    @load="info = `${$event.detail.format}, ${$event.detail.pages} pages`"
    @error="info = $event.detail.message"
  />
  <p>{{ info }}</p>
</template>
