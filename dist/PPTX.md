# PPTX support (beta)

PPTX, PPSX and POTX files are drawn by [pptx-preview](https://www.npmjs.com/package/pptx-preview) 1.0.7. Treat this format as beta. Most decks draw well, but some shapes, SmartArt and charts may look different from PowerPoint. When a deck cannot be drawn, the viewer shows a clear error that says PPTX support is in beta, and the `error` event fires with `code: "pptx-beta"`.

## Licence

The npm package states the ISC licence. Its README says the published package is free to use, commercial use included. The source code of pptx-preview is not public, so Zovo Doc Viewer ships its published build unchanged, in `dist/formats/pptx.js` only. The build also contains echarts (Apache-2.0), zrender (BSD-3-Clause), jszip (MIT option), lodash (MIT), uuid (MIT) and tslib (0BSD). Their full licence texts are in THIRD-PARTY-NOTICES.md.

## Leaving PPTX out

The PPTX code is loaded only when a PPTX file is opened. If you do not want it on your site, delete `dist/formats/pptx.js` from your self-hosted copy. A PPTX file then shows "The viewer code for this format could not be loaded" instead of slides, and the other formats work as before. The WordPress build will not include PPTX at all, because WordPress.org asks for readable source code.
