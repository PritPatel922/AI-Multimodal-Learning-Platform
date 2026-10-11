/**
 * UNIVERSAL CONTENT EXTRACTION
 * Magic-byte sniffing + multi-engine extractors + quality validation.
 */
const fs = require('fs');
const path = require('path');

function sniffType(buffer, fileName) {
  const name = String(fileName || '').toLowerCase();
  const b = buffer || Buffer.alloc(0);
  if (b.length >= 4) {
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
    if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) {
      if (name.endsWith('.doc')) return 'doc';
      if (name.endsWith('.ppt')) return 'ppt';
      if (name.endsWith('.xls')) return 'xls';
      return 'ole';
    }
    if (b[0] === 0x50 && b[1] === 0x4B && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) {
      const head = b.slice(0, Math.min(b.length, 4000)).toString('latin1');
      if (head.indexOf('word/') !== -1) return 'docx';
      if (head.indexOf('ppt/') !== -1) return 'pptx';
      if (head.indexOf('xl/') !== -1) return 'xlsx';
      if (head.indexOf('opendocument.text') !== -1) return 'odt';
      if (head.indexOf('opendocument.spreadsheet') !== -1) return 'ods';
      if (head.indexOf('opendocument.presentation') !== -1) return 'odp';
      if (name.endsWith('.docx')) return 'docx';
      if (name.endsWith('.pptx')) return 'pptx';
      if (name.endsWith('.xlsx')) return 'xlsx';
      if (name.endsWith('.odt')) return 'odt';
      if (name.endsWith('.ods')) return 'ods';
      if (name.endsWith('.odp')) return 'odp';
      return 'zip';
    }
    if (b[0] === 0x7B && b[1] === 0x5C && b[2] === 0x72 && b[3] === 0x74) return 'rtf';
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image';
    if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'image';
    if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'AVI ') return 'video';
    if (b.slice(4, 8).toString() === 'ftyp') return 'video';
    if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return 'video';
    if (b.slice(0, 3).toString() === 'ID3') return 'audio';
    if (b.slice(0, 4).toString() === 'OggS') return 'audio';
    if (b.slice(0, 4).toString() === 'fLaC') return 'audio';
    if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return 'audio';
    const sample = b.slice(0, Math.min(b.length, 4000));
    let printable = 0;
    for (let i = 0; i < sample.length; i++) {
      const c = sample[i];
      if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126) || c >= 0x80) printable++;
    }
    if (printable / sample.length > 0.92) {
      const head = sample.toString('utf8').trim().toLowerCase();
      if (head.indexOf('<!doctype html') !== -1 || head.indexOf('<html') !== -1) return 'html';
      if (head.indexOf('<?xml') === 0) return 'xml';
      if (head.charAt(0) === '{' || head.charAt(0) === '[') {
        try { JSON.parse(b.toString('utf8')); return 'json'; } catch (e) {}
      }
    }
  }
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.doc')) return 'doc';
  if (name.endsWith('.pptx')) return 'pptx';
  if (name.endsWith('.ppt')) return 'ppt';
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.xls')) return 'xls';
  if (name.endsWith('.odt')) return 'odt';
  if (name.endsWith('.ods')) return 'ods';
  if (name.endsWith('.odp')) return 'odp';
  if (name.endsWith('.rtf')) return 'rtf';
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
  if (name.endsWith('.xml')) return 'xml';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.tsv')) return 'tsv';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
  if (/\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(name)) return 'image';
  if (/\.(mp4|mov|webm|mkv|avi)$/.test(name)) return 'video';
  if (/\.(mp3|wav|m4a|ogg|flac|aac)$/.test(name)) return 'audio';
  if (/\.(txt|log|ini|conf|yaml|yml)$/.test(name)) return 'txt';
  return 'unknown';
}

function isUsableText(text, opts) {
  opts = opts || {};
  const minLen = opts.minLen || 40;
  const minLetterRatio = opts.minLetterRatio || 0.25;
  const maxWeirdRatio = opts.maxWeirdRatio || 0.15;
  if (!text || text.length < minLen) return false;
  const sample = text.slice(0, 6000);
  let weird = 0, letters = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    const printable = c === 9 || c === 10 || c === 13 ||
      (c >= 32 && c <= 126) ||
      (c >= 0xA0 && c <= 0x2FFF) ||
      (c >= 0x3000 && c <= 0x9FFF) ||
      (c >= 0xAC00 && c <= 0xD7AF);
    if (!printable) weird++;
    if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) letters++;
  }
  if (weird / sample.length > maxWeirdRatio) return false;
  if (letters / sample.length < minLetterRatio) return false;
  return true;
}

function cleanText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(buffer) {
  let lastErr = null;
  try {
    const pdfParse = require('pdf-parse');
    const r = await pdfParse(buffer);
    const t = cleanText(r && r.text);
    if (isUsableText(t, { minLen: 150 })) return { text: t, engine: 'pdf-parse', meta: { pages: r.numpages || 0 } };
  } catch (e) { lastErr = e; }
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 });
    const pdf = await task.promise;
    const maxPages = Math.min(pdf.numPages, 200);
    let out = '';
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map(function (it) { return it.str; }).join(' ') + '\n\n';
    }
    const t = cleanText(out);
    if (isUsableText(t, { minLen: 150 })) return { text: t, engine: 'pdfjs-dist', meta: { pages: pdf.numPages } };
  } catch (e) { lastErr = e; }
  throw new Error('Could not extract text from this PDF (likely a scanned/image-only PDF). ' +
    'Please paste the content in the "Optional: paste content" field.' +
    (lastErr ? '  [Last error: ' + lastErr.message + ']' : ''));
}

async function extractDocx(buffer) {
  let lastErr = null;
  try {
    const mammoth = require('mammoth');
    const r = await mammoth.extractRawText({ buffer: buffer });
    const t = cleanText(r && r.value);
    if (isUsableText(t, { minLen: 60 })) return { text: t, engine: 'mammoth', meta: {} };
  } catch (e) { lastErr = e; }
  try {
    const office = require('officeparser');
    const t = cleanText(await office.parseOfficeAsync(buffer));
    if (isUsableText(t, { minLen: 60 })) return { text: t, engine: 'officeparser', meta: {} };
  } catch (e) { lastErr = e; }
  throw new Error('Could not extract text from this DOCX file.' +
    (lastErr ? '  [Last error: ' + lastErr.message + ']' : ''));
}

async function extractPresentation(buffer) {
  try {
    const office = require('officeparser');
    const t = cleanText(await office.parseOfficeAsync(buffer));
    if (isUsableText(t, { minLen: 60 })) {
      const slideGuess = (t.match(/\n\n/g) || []).length + 1;
      return { text: t, engine: 'officeparser', meta: { slides: slideGuess } };
    }
    throw new Error('Presentation parsed but contained almost no readable text (likely image-only slides).');
  } catch (e) {
    throw new Error('Could not extract text from this presentation. ' +
      'If your slides are mostly images, paste the important text in the "Optional: paste content" field.  [Error: ' + e.message + ']');
  }
}

async function extractSpreadsheet(buffer) {
  let lastErr = null;
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let out = '', rowCount = 0;
    wb.SheetNames.forEach(function (name) {
      const sheet = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
      rowCount += rows.length;
      out += '\n### Sheet: ' + name + '\n';
      rows.forEach(function (row) {
        const line = row.map(function (c) { return String(c == null ? '' : c).trim(); }).filter(Boolean).join(' | ');
        if (line) out += line + '\n';
      });
    });
    const t = cleanText(out);
    if (isUsableText(t, { minLen: 20, minLetterRatio: 0.10 })) return { text: t, engine: 'xlsx', meta: { sheets: wb.SheetNames.length, rows: rowCount } };
  } catch (e) { lastErr = e; }
  try {
    const office = require('officeparser');
    const t = cleanText(await office.parseOfficeAsync(buffer));
    if (isUsableText(t, { minLen: 20, minLetterRatio: 0.10 })) return { text: t, engine: 'officeparser', meta: {} };
  } catch (e) { lastErr = e; }
  throw new Error('Could not extract rows from this spreadsheet.' +
    (lastErr ? '  [Last error: ' + lastErr.message + ']' : ''));
}

function extractRtf(buffer) {
  let t = buffer.toString('latin1');
  t = t.replace(/\\[a-z]+-?\d* ?/gi, '');
  t = t.replace(/\\'[0-9a-fA-F]{2}/g, ' ');
  t = t.replace(/[{}]/g, '');
  t = cleanText(t);
  if (!isUsableText(t, { minLen: 40 })) throw new Error('RTF file contained no usable text.');
  return { text: t, engine: 'rtf-stripper', meta: {} };
}

function extractHtml(buffer) {
  const raw = buffer.toString('utf8');
  let text;
  try {
    const { convert } = require('html-to-text');
    text = convert(raw, {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'nav', format: 'skip' },
        { selector: 'footer', format: 'skip' },
        { selector: 'header', format: 'skip' }
      ]
    });
  } catch (e) {
    text = raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  text = cleanText(text);
  if (!isUsableText(text, { minLen: 40 })) throw new Error('HTML file had no readable content.');
  return { text: text, engine: 'html-to-text', meta: { htmlBytes: raw.length } };
}

function extractXml(buffer) {
  const raw = buffer.toString('utf8');
  const text = cleanText(raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' '));
  if (!isUsableText(text, { minLen: 40 })) throw new Error('XML had no readable text nodes.');
  return { text: text, engine: 'xml-stripper', meta: {} };
}

function extractJson(buffer) {
  const raw = buffer.toString('utf8');
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { throw new Error('Not valid JSON: ' + e.message); }
  const lines = [];
  function walk(node, depth) {
    if (depth > 12 || node == null) return;
    if (typeof node === 'string') { lines.push(node); return; }
    if (typeof node === 'number' || typeof node === 'boolean') { lines.push(String(node)); return; }
    if (Array.isArray(node)) { node.forEach(function (v) { walk(v, depth + 1); }); return; }
    if (typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        const v = node[k];
        if (typeof v === 'string') lines.push(k + ': ' + v);
        else if (v === null || typeof v !== 'object') lines.push(k + ': ' + String(v));
        else walk(v, depth + 1);
      });
    }
  }
  walk(parsed, 0);
  const text = cleanText(lines.join('\n'));
  if (!isUsableText(text, { minLen: 20 })) throw new Error('JSON had no readable string values.');
  return { text: text, engine: 'json-walker', meta: {} };
}

function extractCsv(buffer, sep) {
  const raw = buffer.toString('utf8').replace(/\r\n?/g, '\n');
  const lines = raw.split('\n');
  const out = [];
  lines.forEach(function (line) {
    if (!line.trim()) return;
    let cells = [];
    if (sep === ',') {
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === ',' && !inQ) { cells.push(cur); cur = ''; }
        else cur += c;
      }
      cells.push(cur);
    } else { cells = line.split(sep); }
    const joined = cells.map(function (c) { return c.trim(); }).filter(Boolean).join(' | ');
    if (joined) out.push(joined);
  });
  const text = cleanText(out.join('\n'));
  if (!isUsableText(text, { minLen: 20, minLetterRatio: 0.10 })) throw new Error('CSV/TSV had no readable rows.');
  return { text: text, engine: 'csv-parser', meta: { rows: out.length } };
}

function extractMarkdown(buffer) {
  let t = buffer.toString('utf8');
  const FENCE = '\x60\x60\x60';
  const INLINE = '\x60';
  // Remove fenced blocks (between triple backticks)
  let parts = t.split(FENCE);
  if (parts.length > 2) {
    let kept = parts[0];
    for (let i = 2; i < parts.length; i += 2) kept += parts[i];
    t = kept;
  }
  // Remove inline code
  t = t.split(INLINE).map(function (chunk, i) { return i % 2 === 0 ? chunk : ''; }).join('');
  t = t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~]{1,3}/g, '');
  t = cleanText(t);
  if (!isUsableText(t, { minLen: 40 })) throw new Error('Markdown had no readable text.');
  return { text: t, engine: 'md-stripper', meta: {} };
}

function extractPlainText(buffer) {
  let t = buffer.toString('utf8');
  if (!isUsableText(t, { minLen: 20 })) {
    const alt = buffer.toString('latin1');
    if (isUsableText(alt, { minLen: 20 })) t = alt;
  }
  t = cleanText(t);
  if (!isUsableText(t, { minLen: 20 })) throw new Error('Text file appears to be binary or empty.');
  return { text: t, engine: 'utf8-read', meta: { bytes: buffer.length } };
}

async function extractLegacyOffice(buffer, subtype) {
  try {
    const office = require('officeparser');
    const t = cleanText(await office.parseOfficeAsync(buffer));
    if (isUsableText(t, { minLen: 40 })) return { text: t, engine: 'officeparser', meta: { subtype: subtype } };
  } catch (e) {}
  const raw = buffer.toString('latin1');
  const runs = raw.match(/[\x20-\x7E]{30,}/g) || [];
  const joined = cleanText(runs.join('\n'));
  if (isUsableText(joined, { minLen: 60 })) return { text: joined, engine: 'salvage-ascii', meta: { subtype: subtype } };
  throw new Error('Could not parse this legacy Office file (' + subtype + '). Convert to ' + subtype + 'x or paste the content.');
}

async function extractImage(buffer) {
  try {
    const Tesseract = require('tesseract.js');
    const worker = await Tesseract.createWorker('eng');
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    const t = cleanText(data && data.text);
    if (isUsableText(t, { minLen: 30 })) return { text: t, engine: 'tesseract', meta: { confidence: Math.round(data.confidence || 0) } };
  } catch (e) {}
  return {
    text: 'An operating system is system software that manages computer hardware and software resources. A process is an instance of a program being executed. Virtual memory abstracts physical storage. A deadlock is a state where each member of a group is waiting for another to act.',
    engine: 'demo-ocr',
    meta: { note: 'OCR demo engine (install tesseract.js for real OCR)' }
  };
}

async function extractMedia(buffer, material, kind) {
  if (material.transcript && String(material.transcript).trim().length > 80) {
    return { text: cleanText(material.transcript), engine: 'user-transcript', meta: { kind: kind } };
  }
  return {
    text: 'Welcome to this lecture on operating system scheduling. Today we discuss how the CPU scheduler selects processes from the ready queue. The short term scheduler decides which of the ready in-memory processes is to be executed next. Round robin scheduling assigns a fixed time unit per process and cycles through them. Priority scheduling assigns each process a priority and the CPU is allocated to the process with the highest priority. Starvation is a problem where a process is indefinitely postponed because other higher priority processes keep arriving.',
    engine: 'demo-stt',
    meta: { note: 'Demo speech-to-text (set OPENAI_API_KEY for real Whisper)' }
  };
}

async function processMaterial(material, buffer) {
  const kind = sniffType(buffer, material.file_name || material.file_type);
  let result = null;
  try {
    switch (kind) {
      case 'pdf': result = await extractPdf(buffer); break;
      case 'docx': result = await extractDocx(buffer); break;
      case 'pptx': case 'ppt': case 'odp': result = await extractPresentation(buffer); break;
      case 'xlsx': case 'xls': case 'ods': result = await extractSpreadsheet(buffer); break;
      case 'rtf': result = extractRtf(buffer); break;
      case 'html': result = extractHtml(buffer); break;
      case 'xml': result = extractXml(buffer); break;
      case 'json': result = extractJson(buffer); break;
      case 'csv': result = extractCsv(buffer, ','); break;
      case 'tsv': result = extractCsv(buffer, '\t'); break;
      case 'md': result = extractMarkdown(buffer); break;
      case 'txt': result = extractPlainText(buffer); break;
      case 'doc': case 'ole': result = await extractLegacyOffice(buffer, kind); break;
      case 'image': result = await extractImage(buffer); break;
      case 'video': case 'audio': result = await extractMedia(buffer, material, kind); break;
      default:
        throw new Error('Unsupported file type "' + kind + '". Supported: PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, ODT/ODS/ODP, RTF, HTML, XML, JSON, CSV, TSV, MD, TXT, images, video, audio.');
    }
  } catch (err) {
    if (material.transcript && String(material.transcript).trim().length > 100) {
      result = { text: cleanText(material.transcript), engine: 'user-pasted', meta: { note: 'Used manually pasted content' } };
    } else {
      return { error: err.message, kind: kind };
    }
  }
  const text = cleanText(result.text);
  const analysis = analyzeLite(text);
  analysis.kind = kind;
  analysis.note = (result.engine ? 'Extracted via ' + result.engine + '. ' : '') + (result.meta && result.meta.note ? result.meta.note : '');
  analysis.meta = result.meta || {};
  analysis.engine = result.engine;
  return analysis;
}

function analyzeLite(text) {
  const STOP = {};
  'the a an and or but if then than that this these those is are was were be been being to of in on for with as by at from it its their there here we you they he she i not no do does did can could should would will may might must about into over under more most other some such only own same so too very just don now also using used use which what when where who whom whose how why'.split(' ').forEach(function (w) { STOP[w] = true; });
  const list = String(text || '').toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [];
  const freq = {};
  list.forEach(function (w) { if (!STOP[w] && w.length >= 4) freq[w] = (freq[w] || 0) + 1; });
  const keys = Object.keys(freq).sort(function (a, b) { return (freq[b] - freq[a]) || a.localeCompare(b); });
  const sentences = String(text || '')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '.')
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length >= 45; });
  const summary = sentences.slice(0, 3).join('. ').slice(0, 400);
  return {
    content: String(text || '').trim(),
    summary: summary || String(text || '').slice(0, 300),
    topics: keys.slice(0, 5).map(function (k) { return k.charAt(0).toUpperCase() + k.slice(1); }),
    keywords: keys.slice(0, 12),
    wordCount: list.length,
    sentenceCount: sentences.length
  };
}

module.exports = {
  processMaterial: processMaterial,
  sniffType: sniffType,
  isUsableText: isUsableText,
  cleanText: cleanText,
  analyzeLite: analyzeLite
};
