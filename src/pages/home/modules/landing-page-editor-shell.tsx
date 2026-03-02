import { GripVertical, ChevronUp, ChevronDown, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";
import type { ReactNode } from "react";

export const LandingWidgetEditorShell = ({
  children,
  onRemove,
  onMove,
  onInsertTextBefore,
  onInsertTextAfter,
  dragHandleLabel,
  insertTextBeforeLabel,
  insertTextAfterLabel,
  widgetIndex
}: {
  children: ReactNode;
  onRemove: () => void;
  onMove: (sourceWidgetIndex: number, targetWidgetIndex: number) => void;
  onInsertTextBefore: () => void;
  onInsertTextAfter: () => void;
  dragHandleLabel: string;
  insertTextBeforeLabel: string;
  insertTextAfterLabel: string;
  widgetIndex: number;
}) => (
  <div className="not-prose my-2">
    <div
      className="relative"
      data-widget-index={widgetIndex}
      draggable
      contentEditable={false}
      onDragStart={(event) => {
        const sourceWidgetIndex = Number.parseInt(event.currentTarget.dataset.widgetIndex ?? "", 10);
        if (!Number.isFinite(sourceWidgetIndex)) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/domora-widget-index", String(sourceWidgetIndex));
        event.dataTransfer.setData("text/plain", String(sourceWidgetIndex));
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceWidgetIndex = Number.parseInt(
          event.dataTransfer.getData("text/domora-widget-index") || event.dataTransfer.getData("text/plain"),
          10
        );
        const targetWidgetIndex = Number.parseInt(event.currentTarget.dataset.widgetIndex ?? "", 10);
        if (!Number.isFinite(sourceWidgetIndex) || !Number.isFinite(targetWidgetIndex)) {
          return;
        }
        onMove(sourceWidgetIndex, targetWidgetIndex);
      }}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute left-2 top-2 z-[2100] inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 active:cursor-grabbing dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label={dragHandleLabel}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{dragHandleLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute left-2 top-10 z-[2100] inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onInsertTextBefore();
              }}
              aria-label={insertTextBeforeLabel}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{insertTextBeforeLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute left-2 top-[4.25rem] z-[2100] inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onInsertTextAfter();
              }}
              aria-label={insertTextAfterLabel}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{insertTextAfterLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute right-2 top-2 z-[2100] inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove();
              }}
              aria-label="Widget entfernen"
            >
              <X className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Widget entfernen</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  </div>
);
