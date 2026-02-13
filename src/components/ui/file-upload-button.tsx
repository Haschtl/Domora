import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "./button";

interface FileUploadButtonProps {
  id: string;
  accept?: string;
  disabled?: boolean;
  buttonLabel: string;
  onFileSelect: (file: File) => void | Promise<void>;
}

export const FileUploadButton = ({ id, accept = "image/*", disabled, buttonLabel, onFileSelect }: FileUploadButtonProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setFileName(file.name);
          void onFileSelect(file);
          event.currentTarget.value = "";
        }}
      />

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          inputRef.current?.click();
        }}
      >
        <Upload className="mr-2 h-4 w-4" />
        {buttonLabel}
      </Button>

      {fileName ? <p className="text-xs text-slate-500 dark:text-slate-400">{fileName}</p> : null}
    </div>
  );
};
