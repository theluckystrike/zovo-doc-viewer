// Hard limits. They protect the page that embeds the viewer from hostile or oversized files.
export const LIMITS = Object.freeze({
  maxFileBytes: 200 * 1024 * 1024,     // largest file the element will fetch or load (attribute max-size, in MB, can lower or raise it)
  zipMaxEntries: 10000,                 // DOCX, XLSX, PPTX and ODT are ZIP files
  zipMaxBytes: 500 * 1024 * 1024,       // total uncompressed size of all ZIP entries
  csvMaxRows: 1000000,
  csvMaxCells: 20000000,
  csvMaxBytes: 150 * 1024 * 1024,
  sheetMaxRows: 200000,                 // per sheet, XLSX/XLS/ODS
  sheetMaxCols: 2000,
  parquetMaxRows: 100000,
  printMaxRows: 5000,
});
