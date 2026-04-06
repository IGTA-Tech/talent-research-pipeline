// ============================================================
// PDF Builder — Convert Markdown content to PDF using pdf-lib
// ============================================================

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 72;
const MARGIN_RIGHT = 72;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 72;
const LINE_HEIGHT = 14;
const HEADING1_SIZE = 18;
const HEADING2_SIZE = 14;
const HEADING3_SIZE = 12;
const BODY_SIZE = 10;
const MAX_LINE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

/**
 * Build a PDF from markdown content
 */
export async function buildPdf(
  markdownContent: string,
  title: string
): Promise<{ buffer: Buffer; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setAuthor("O1DMatch Talent Research Pipeline");
  pdfDoc.setCreationDate(new Date());

  const fonts: PdfFonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
  };

  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let yPosition = PAGE_HEIGHT - MARGIN_TOP;
  let pageCount = 1;

  // Helper: add a new page
  function addNewPage(): PDFPage {
    currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    yPosition = PAGE_HEIGHT - MARGIN_TOP;
    pageCount++;
    return currentPage;
  }

  // Helper: check if we need a new page
  function checkPageBreak(neededSpace: number = LINE_HEIGHT * 2) {
    if (yPosition - neededSpace < MARGIN_BOTTOM) {
      addNewPage();
    }
  }

  // Helper: wrap text to fit within max width
  function wrapText(text: string, font: PDFFont, size: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, size);

      if (width > MAX_LINE_WIDTH && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  // Helper: draw text line
  function drawText(text: string, font: PDFFont, size: number, color = rgb(0, 0, 0)) {
    const lines = wrapText(text, font, size);
    for (const line of lines) {
      checkPageBreak();
      currentPage.drawText(line, {
        x: MARGIN_LEFT,
        y: yPosition,
        size,
        font,
        color,
      });
      yPosition -= size + 4;
    }
  }

  // Parse markdown and render
  const lines = markdownContent.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines (add spacing)
    if (!trimmed) {
      yPosition -= LINE_HEIGHT * 0.5;
      continue;
    }

    // Heading 1: # Title
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      checkPageBreak(HEADING1_SIZE * 3);
      yPosition -= LINE_HEIGHT;
      drawText(trimmed.replace(/^#\s+/, ""), fonts.bold, HEADING1_SIZE, rgb(0.1, 0.1, 0.3));
      yPosition -= LINE_HEIGHT * 0.5;

      // Draw underline
      currentPage.drawLine({
        start: { x: MARGIN_LEFT, y: yPosition + 8 },
        end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: yPosition + 8 },
        thickness: 1,
        color: rgb(0.3, 0.3, 0.6),
      });
      yPosition -= LINE_HEIGHT * 0.5;
      continue;
    }

    // Heading 2: ## Section
    if (trimmed.startsWith("## ")) {
      checkPageBreak(HEADING2_SIZE * 3);
      yPosition -= LINE_HEIGHT * 0.8;
      drawText(trimmed.replace(/^##\s+/, ""), fonts.bold, HEADING2_SIZE, rgb(0.15, 0.15, 0.4));
      yPosition -= LINE_HEIGHT * 0.3;
      continue;
    }

    // Heading 3: ### Subsection
    if (trimmed.startsWith("### ")) {
      checkPageBreak(HEADING3_SIZE * 2);
      yPosition -= LINE_HEIGHT * 0.5;
      drawText(trimmed.replace(/^###\s+/, ""), fonts.bold, HEADING3_SIZE, rgb(0.2, 0.2, 0.5));
      yPosition -= LINE_HEIGHT * 0.2;
      continue;
    }

    // Bullet points
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bulletText = trimmed.replace(/^[-*]\s+/, "");
      checkPageBreak();
      // Clean markdown formatting from bullet text
      const cleanText = cleanMarkdown(bulletText);
      const wrappedLines = wrapText(`  \u2022  ${cleanText}`, fonts.regular, BODY_SIZE);
      for (const wrappedLine of wrappedLines) {
        checkPageBreak();
        currentPage.drawText(wrappedLine, {
          x: MARGIN_LEFT,
          y: yPosition,
          size: BODY_SIZE,
          font: fonts.regular,
          color: rgb(0.1, 0.1, 0.1),
        });
        yPosition -= BODY_SIZE + 4;
      }
      continue;
    }

    // Numbered items
    if (/^\d+\.\s/.test(trimmed)) {
      const cleanText = cleanMarkdown(trimmed);
      drawText(`  ${cleanText}`, fonts.regular, BODY_SIZE, rgb(0.1, 0.1, 0.1));
      continue;
    }

    // Bold text (standalone): **text**
    if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      const boldText = trimmed.replace(/\*\*/g, "");
      drawText(boldText, fonts.bold, BODY_SIZE);
      continue;
    }

    // Horizontal rule
    if (trimmed === "---" || trimmed === "***") {
      yPosition -= LINE_HEIGHT * 0.5;
      checkPageBreak();
      currentPage.drawLine({
        start: { x: MARGIN_LEFT, y: yPosition + 4 },
        end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: yPosition + 4 },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      yPosition -= LINE_HEIGHT * 0.5;
      continue;
    }

    // Regular paragraph text
    const cleanText = cleanMarkdown(trimmed);
    drawText(cleanText, fonts.regular, BODY_SIZE, rgb(0.1, 0.1, 0.1));
  }

  // Add page numbers
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = `Page ${i + 1} of ${pages.length}`;
    page.drawText(pageNum, {
      x: PAGE_WIDTH - MARGIN_RIGHT - fonts.regular.widthOfTextAtSize(pageNum, 8),
      y: MARGIN_BOTTOM - 20,
      size: 8,
      font: fonts.regular,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Add footer
    const footer = "Generated by O1DMatch Talent Research Pipeline";
    page.drawText(footer, {
      x: MARGIN_LEFT,
      y: MARGIN_BOTTOM - 20,
      size: 8,
      font: fonts.italic,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const pdfBytes = await pdfDoc.save();

  return {
    buffer: Buffer.from(pdfBytes),
    pageCount: pages.length,
  };
}

/** Strip markdown formatting from text */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold
    .replace(/\*([^*]+)\*/g, "$1") // Italic
    .replace(/`([^`]+)`/g, "$1") // Code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links (keep text)
    .replace(/#{1,6}\s/g, ""); // Headings
}
