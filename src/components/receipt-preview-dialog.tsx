import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

interface ReceiptPreviewDialogProps {
  open: boolean;
  imageUrl: string | null;
  title?: string | null;
  onOpenChange: (open: boolean) => void;
}

export const ReceiptPreviewDialog = ({
  open,
  imageUrl,
  title,
  onOpenChange
}: ReceiptPreviewDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[100dvh] w-screen max-w-none rounded-none border-0 bg-slate-950/95 p-0 text-slate-100">
        <DialogHeader className="flex h-12 flex-row items-center justify-between border-b border-white/10 px-4">
          <DialogTitle className="text-sm font-semibold text-slate-100">
            {title || "Beleg"}
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-slate-100 hover:bg-white/10"
            onClick={() => onOpenChange(false)}
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <div
          className="flex h-[calc(100dvh-3rem)] w-full items-center justify-center overflow-auto"
          style={{ touchAction: "pan-x pan-y pinch-zoom" }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title || "Beleg"}
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
