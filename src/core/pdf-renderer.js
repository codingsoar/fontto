import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { TEMPLATE_PAGE_WIDTH } from './template-import.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function renderPdfFileToCanvases(file, targetWidth = TEMPLATE_PAGE_WIDTH) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const canvases = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    canvases.push(canvas);
  }

  return canvases;
}
