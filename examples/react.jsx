// React 18 or 19. Load the element once, for example with this tag in index.html:
//   <script type="module" src="https://cdn.jsdelivr.net/gh/theluckystrike/zovo-doc-viewer@v0.1.0/dist/zovo-doc-viewer.js"></script>
// Self-hosting: copy dist/ to public/zovo-doc-viewer/ and use src="/zovo-doc-viewer/zovo-doc-viewer.js" instead.
import { useEffect, useRef } from 'react';

export function DocViewer({ src, file, theme = 'auto', onLoad, onError }) {
  const ref = useRef(null);

  // Custom element events are plain DOM events, so attach them with addEventListener.
  useEffect(() => {
    const el = ref.current;
    const load = (e) => onLoad && onLoad(e.detail);
    const error = (e) => onError && onError(e.detail);
    el.addEventListener('load', load);
    el.addEventListener('error', error);
    return () => { el.removeEventListener('load', load); el.removeEventListener('error', error); };
  }, [onLoad, onError]);

  // A File or Blob from an <input type="file"> goes through load().
  useEffect(() => { if (file) ref.current.load(file); }, [file]);

  return <zovo-doc-viewer ref={ref} src={src} theme={theme} download="false" style={{ display: 'block', height: 600 }} />;
}
