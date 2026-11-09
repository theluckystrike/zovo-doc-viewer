const LIGHT = '--zdv-bg:#fff;--zdv-fg:#1f2328;--zdv-muted:#59636e;--zdv-line:#d1d9e0;--zdv-head:#f6f8fa;--zdv-hover:#e8ecf0;--zdv-accent:#0969da;--zdv-desk:#e6e8eb;--zdv-hit:#fff1a0;--zdv-hit-cur:#ffb24d;--zdv-err:#b3261e;color-scheme:light';
const DARK = '--zdv-bg:#0d1117;--zdv-fg:#e6edf3;--zdv-muted:#9198a1;--zdv-line:#3d444d;--zdv-head:#151b23;--zdv-hover:#262c36;--zdv-accent:#4493f8;--zdv-desk:#262c36;--zdv-hit:#6b5800;--zdv-hit-cur:#a36500;--zdv-err:#ff7b72;color-scheme:dark';

export const CORE_CSS = `
:host{${LIGHT};display:block;position:relative;height:var(--zdv-height,600px);min-height:220px;box-sizing:border-box;border:1px solid var(--zdv-line);border-radius:6px;overflow:hidden;background:var(--zdv-bg);color:var(--zdv-fg);font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;contain:content}
:host([theme=dark]){${DARK}}
@media (prefers-color-scheme:dark){:host(:not([theme=light])){${DARK}}}
:host(:fullscreen){height:100vh;border-radius:0}
:host([hidden]){display:none}
*{box-sizing:border-box}
.zdv{display:flex;flex-direction:column;height:100%}
.zdv-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:4px 8px;border-bottom:1px solid var(--zdv-line);background:var(--zdv-head);min-height:38px}
:host([toolbar=false]) .zdv-bar{display:none}
.zdv-grp{display:inline-flex;align-items:center;gap:2px}
.zdv-name{font-weight:600;max-width:28ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zdv-beta{font-size:11px;padding:1px 6px;border-radius:10px;border:1px solid var(--zdv-line);color:var(--zdv-muted)}
.zdv-spacer{flex:1}
button{font:inherit;color:inherit;background:transparent;border:1px solid transparent;border-radius:5px;min-width:28px;height:28px;padding:0 6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
button:hover{background:var(--zdv-hover)}
button:focus-visible,input:focus-visible,.zdv-view:focus-visible,a:focus-visible{outline:2px solid var(--zdv-accent);outline-offset:1px}
button[disabled]{opacity:.4;cursor:default}
button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
input{font:inherit;color:inherit;background:var(--zdv-bg);border:1px solid var(--zdv-line);border-radius:5px;height:28px;padding:0 6px}
.zdv-page{width:4.5em;text-align:right}
.zdv-find{width:13em}
.zdv-count{color:var(--zdv-muted);min-width:6em;font-size:12px}
.zdv-view{position:relative;flex:1;overflow:auto;background:var(--zdv-desk);outline:none}
.zdv-view.grid{overflow:hidden;background:var(--zdv-bg)}
.zdv-view.grid .zdv-body{height:100%}
.zdv-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:var(--zdv-muted);pointer-events:none}
.zdv-msg[hidden]{display:none}
.zdv-msg.err{color:var(--zdv-err);pointer-events:auto}
.zdv-tabs{display:flex;gap:2px;overflow-x:auto;padding:2px 6px;border-top:1px solid var(--zdv-line);background:var(--zdv-head)}
.zdv-tabs[hidden]{display:none}
.zdv-tab{height:26px;border-radius:0 0 5px 5px;white-space:nowrap;color:var(--zdv-muted)}
.zdv-tab[aria-selected=true]{background:var(--zdv-bg);color:var(--zdv-fg);border-color:var(--zdv-line);border-top-color:transparent;font-weight:600}
.zdv-status{min-height:22px;padding:2px 8px;font-size:12px;color:var(--zdv-muted);border-top:1px solid var(--zdv-line);background:var(--zdv-head);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:130px}
.zdv-corner{position:absolute;right:6px;bottom:3px;z-index:5;font:11px/16px system-ui,sans-serif;color:var(--zdv-muted);text-decoration:none;padding:0 5px;border-radius:4px;background:var(--zdv-head)}
.zdv-corner:hover{color:var(--zdv-accent);text-decoration:underline}
.zdv-corner[hidden]{display:none}
.zdv-docx .docx-wrapper{background:var(--zdv-desk);padding:16px 16px 0}
.zdv-docx .docx-wrapper>section.docx{margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.zdv-pptx{padding:12px;display:flex;justify-content:center}
.zdv-pptx .pptx-preview-wrapper{height:auto!important;overflow:visible!important;background:transparent!important}
.zdv-pptx [class*=pptx-preview-slide-wrapper]{margin:0 auto 16px!important;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
[hidden]{display:none!important}
`;

export const PRINT_CSS = `body{margin:0;font:12pt/1.4 system-ui,sans-serif;color:#000;background:#fff}
.zdv-print-grid{border-collapse:collapse;font:9pt ui-monospace,Menlo,Consolas,monospace}.zdv-print-grid td,.zdv-print-grid th{border:1px solid #999;padding:2px 4px;text-align:left;vertical-align:top}
.docx-wrapper{background:#fff!important;padding:0!important}.docx-wrapper>section.docx{box-shadow:none!important;margin:0!important;page-break-after:always}
.zdv-odt,.zdv-pdf,.zdv-pptx{background:#fff!important;padding:0!important;display:block!important}.zdv-odt-page{box-shadow:none!important;width:auto!important}
mark{background:none}@page{margin:12mm}`;
