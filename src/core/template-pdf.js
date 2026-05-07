import { PDFDocument } from 'pdf-lib';
import { buildTemplateSvg, getTemplateMetrics, getTemplatePages } from './template-import.js';

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

export async function buildTemplatePdfBytes(slots, readImageSource) {
  const pages = getTemplatePages(slots);
  const pdf = await PDFDocument.create();

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageSlots = pages[pageIndex];
    const svg = buildTemplateSvg(pageSlots, pageIndex, pages.length);
    const metrics = getTemplateMetrics(pageSlots.length);
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = await readImageSource(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = metrics.width;
    canvas.height = metrics.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f3f5fb';
    ctx.fillRect(0, 0, metrics.width, metrics.height);
    ctx.drawImage(image, 0, 0, metrics.width, metrics.height);
    URL.revokeObjectURL(svgUrl);

    const pngBytes = dataUrlToBytes(canvas.toDataURL('image/png'));
    const png = await pdf.embedPng(pngBytes);
    const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: A4_WIDTH_PT,
      height: A4_HEIGHT_PT,
    });
  }

  return pdf.save();
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
