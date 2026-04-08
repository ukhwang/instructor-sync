"use client";

import { useState, useCallback } from "react";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

interface UsePdfProcessorReturn {
  extractAndChunk: (file: File) => Promise<string[]>;
  isProcessing: boolean;
  progress: number;
  error: string | null;
}

export function usePdfProcessor(): UsePdfProcessorReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const extractAndChunk = useCallback(async (file: File): Promise<string[]> => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      // 동적 import — 브라우저에서만 로드
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc =
        `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      const pageTexts: string[] = [];
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        pageTexts.push(pageText);
        setProgress(Math.round((i / totalPages) * 60));
      }

      const fullText = pageTexts.join("\n\n");

      if (fullText.trim().length < 100) {
        throw new Error(
          "PDF에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF는 지원하지 않습니다."
        );
      }

      setProgress(70);

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
        separators: ["\n\n", "\n", ".", " "],
      });

      const chunks = await splitter.splitText(fullText);
      setProgress(100);
      return chunks;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "PDF 처리 중 오류가 발생했습니다.";
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { extractAndChunk, isProcessing, progress, error };
}