"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
  disabled?: boolean;
}

const MAX_SIZE_MB = 10;

export function UploadZone({ onFileSelect, selectedFile, onClear, disabled }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (file: File): boolean => {
    if (file.type !== "application/pdf") {
      setError("PDF 파일만 업로드 가능합니다.");
      return false;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`파일 크기는 ${MAX_SIZE_MB}MB 이하여야 합니다.`);
      return false;
    }
    setError(null);
    return true;
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && validate(file)) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validate(file)) onFileSelect(file);
  };

  if (selectedFile) {
    return (
      <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          disabled={disabled}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label
        className={`block rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-accent"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleChange}
          disabled={disabled}
        />
        <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">PDF를 드래그하거나 클릭하여 업로드</p>
        <p className="text-sm text-muted-foreground mt-1">최대 {MAX_SIZE_MB}MB</p>
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
