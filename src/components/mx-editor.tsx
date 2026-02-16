import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  type JsxComponentDescriptor,
  MDXEditor,
  type MDXEditorMethods,
  activeEditor$,
  activePlugins$,
  allowedHeadingLevels$,
  applyFormat$,
  applyListType$,
  convertSelectionToNode$,
  currentBlockType$,
  currentFormat$,
  currentListType$,
  iconComponentFor$,
  openLinkEditDialog$,
  useCellValue,
  useCellValues,
  usePublisher,
  useTranslation,
  headingsPlugin,
  IS_APPLE,
  jsxPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  IS_BOLD,
  IS_ITALIC,
  IS_UNDERLINE
} from "@mdxeditor/editor";
import { mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  REDO_COMMAND,
  UNDO_COMMAND
} from "lexical";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

const toolbarButtonBase =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const toolbarButtonActive =
  "border-brand-300 bg-brand-50/50 text-brand-700 dark:border-brand-700 dark:text-brand-200";

const ToolbarIconButton = ({
  label,
  onClick,
  disabled,
  active,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        className={`${toolbarButtonBase} ${active ? toolbarButtonActive : ""}`.trim()}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active ? true : undefined}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

const ToolbarDivider = () => <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />;

const DomoraUndoRedo = () => {
  const [iconComponentFor, activeEditor] = useCellValues(iconComponentFor$, activeEditor$);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const t = useTranslation();

  useEffect(() => {
    if (!activeEditor) return;
    return mergeRegister(
      activeEditor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      activeEditor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [activeEditor]);

  return (
    <div className="inline-flex items-center gap-1">
      <ToolbarIconButton
        label={t("toolbar.undo", "Undo {{shortcut}}", {
          shortcut: IS_APPLE ? "⌘Z" : "Ctrl+Z"
        })}
        onClick={() => activeEditor?.dispatchCommand(UNDO_COMMAND, undefined)}
        disabled={!canUndo}
      >
        {iconComponentFor("undo")}
      </ToolbarIconButton>
      <ToolbarIconButton
        label={t("toolbar.redo", "Redo {{shortcut}}", {
          shortcut: IS_APPLE ? "⌘Y" : "Ctrl+Y"
        })}
        onClick={() => activeEditor?.dispatchCommand(REDO_COMMAND, undefined)}
        disabled={!canRedo}
      >
        {iconComponentFor("redo")}
      </ToolbarIconButton>
    </div>
  );
};

const DomoraFormatToggles = () => {
  const [currentFormat, iconComponentFor] = useCellValues(currentFormat$, iconComponentFor$);
  const applyFormat = usePublisher(applyFormat$);
  const t = useTranslation();

  const isBold = (currentFormat & IS_BOLD) !== 0;
  const isItalic = (currentFormat & IS_ITALIC) !== 0;
  const isUnderline = (currentFormat & IS_UNDERLINE) !== 0;

  return (
    <div className="inline-flex items-center gap-1">
      <ToolbarIconButton
        label={isBold ? t("toolbar.removeBold", "Remove bold") : t("toolbar.bold", "Bold")}
        onClick={() => applyFormat("bold")}
        active={isBold}
      >
        {iconComponentFor("format_bold")}
      </ToolbarIconButton>
      <ToolbarIconButton
        label={isItalic ? t("toolbar.removeItalic", "Remove italic") : t("toolbar.italic", "Italic")}
        onClick={() => applyFormat("italic")}
        active={isItalic}
      >
        {iconComponentFor("format_italic")}
      </ToolbarIconButton>
      <ToolbarIconButton
        label={isUnderline ? t("toolbar.removeUnderline", "Remove underline") : t("toolbar.underline", "Underline")}
        onClick={() => applyFormat("underline")}
        active={isUnderline}
      >
        {iconComponentFor("format_underlined")}
      </ToolbarIconButton>
    </div>
  );
};

const DomoraBlockTypeSelect = () => {
  const t = useTranslation();
  const currentBlockType = useCellValue(currentBlockType$);
  const activePlugins = useCellValue(activePlugins$);
  const allowedHeadingLevels = useCellValue(allowedHeadingLevels$);
  const convertSelectionToNode = usePublisher(convertSelectionToNode$);
  const hasQuote = activePlugins.includes("quote");
  const hasHeadings = activePlugins.includes("headings");

  if (!hasQuote && !hasHeadings) return null;

  const items = [
    { label: t("toolbar.blockTypes.paragraph", "Paragraph"), value: "paragraph" }
  ];
  if (hasQuote) items.push({ label: t("toolbar.blockTypes.quote", "Quote"), value: "quote" });
  if (hasHeadings) {
    items.push(
      ...allowedHeadingLevels.map((level) => ({
        label: t("toolbar.blockTypes.heading", "Heading {{level}}", { level }),
        value: `h${level}`
      }))
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <select
          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          value={currentBlockType}
          onChange={(event) => {
            const blockType = event.target.value;
            switch (blockType) {
              case "quote":
                convertSelectionToNode(() => $createQuoteNode());
                break;
              case "paragraph":
                convertSelectionToNode(() => $createParagraphNode());
                break;
              case "":
                break;
              default:
                if (blockType.startsWith("h")) {
                  convertSelectionToNode(() => $createHeadingNode(blockType));
                }
            }
          }}
        >
          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </TooltipTrigger>
      <TooltipContent>{t("toolbar.blockTypeSelect.selectBlockTypeTooltip", "Select block type")}</TooltipContent>
    </Tooltip>
  );
};

const DomoraListsToggle = () => {
  const [currentListType, iconComponentFor] = useCellValues(currentListType$, iconComponentFor$);
  const applyListType = usePublisher(applyListType$);
  const t = useTranslation();

  const items = [
    { type: "bullet", title: t("toolbar.bulletedList", "Bulleted list"), icon: "format_list_bulleted" },
    { type: "number", title: t("toolbar.numberedList", "Numbered list"), icon: "format_list_numbered" },
    { type: "check", title: t("toolbar.checkList", "Check list"), icon: "format_list_checked" }
  ] as const;

  return (
    <div className="inline-flex items-center gap-1">
      {items.map((item) => {
        const active = currentListType === item.type;
        return (
          <ToolbarIconButton
            key={item.type}
            label={item.title}
            onClick={() => applyListType(active ? "" : item.type)}
            active={active}
          >
            {iconComponentFor(item.icon)}
          </ToolbarIconButton>
        );
      })}
    </div>
  );
};

const DomoraCreateLink = () => {
  const iconComponentFor = useCellValue(iconComponentFor$);
  const openLinkDialog = usePublisher(openLinkEditDialog$);
  const t = useTranslation();
  return (
    <ToolbarIconButton label={t("toolbar.link", "Create link")} onClick={() => openLinkDialog()}>
      {iconComponentFor("link")}
    </ToolbarIconButton>
  );
};

const DomoraToolbar = ({ children }: { children?: ReactNode }) => (
  <TooltipProvider>
    <div className="flex flex-wrap items-center gap-2">
      <DomoraUndoRedo />
      <ToolbarDivider />
      <DomoraFormatToggles />
      <DomoraBlockTypeSelect />
      <DomoraListsToggle />
      <DomoraCreateLink />
      {children}
    </div>
  </TooltipProvider>
);

interface MXEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
  chrome?: "card" | "flat";
  insertOptions?: Array<{ label: string; value: string }>;
  insertPlaceholder?: string;
  insertButtonLabel?: string;
  jsxComponentDescriptors?: JsxComponentDescriptor[];
  editorRef?: React.RefObject<MDXEditorMethods | null>;
}

export const MXEditor = ({
  value,
  onChange,
  placeholder,
  minHeightClassName = "min-h-[300px]",
  chrome = "card",
  insertOptions = [],
  insertPlaceholder = "Baustein",
  insertButtonLabel = "Einfügen",
  jsxComponentDescriptors = [],
  editorRef: externalEditorRef
}: MXEditorProps) => {
  const localEditorRef = useRef<MDXEditorMethods>(null);
  const editorRef = externalEditorRef ?? localEditorRef;
  const [selectedInsertValue, setSelectedInsertValue] = useState("");
  const hasInsertOptions = insertOptions.length > 0;
  const resolvedInsertValue = useMemo(() => {
    if (!hasInsertOptions) {
      return "";
    }
    if (selectedInsertValue.length > 0) {
      return selectedInsertValue;
    }
    return insertOptions[0]?.value ?? "";
  }, [hasInsertOptions, insertOptions, selectedInsertValue]);

  const editorTypographyClassName = [
    minHeightClassName,
    "p-4 focus:outline-none",
    "max-w-none",
    "[&_h1]:mt-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight",
    "[&_h2]:mt-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-snug",
    "[&_h3]:mt-3 [&_h3]:text-xl [&_h3]:font-semibold",
    "[&_p]:my-2 [&_p]:leading-relaxed",
    "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
    "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
    "[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-700",
    "[&_a]:text-brand-700 [&_a]:underline [&_a]:decoration-brand-300 [&_a]:underline-offset-2",
    "[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
    "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-slate-200 [&_pre]:bg-slate-50 [&_pre]:p-3",
    "dark:[&_blockquote]:border-brand-700 dark:[&_blockquote]:text-slate-300",
    "dark:[&_a]:text-brand-300 dark:[&_code]:bg-slate-800",
    "dark:[&_pre]:border-slate-700 dark:[&_pre]:bg-slate-900"
  ].join(" ");

  const containerClassName =
    chrome === "flat"
      ? "relative overflow-visible"
      : "relative overflow-visible rounded-xl border border-brand-200 bg-white dark:border-slate-700 dark:bg-slate-900";
  const toolbarClassName =
    chrome === "flat"
      ? "sticky top-0 z-10 border-b border-brand-200/80 bg-brand-50/50 p-2 dark:border-slate-700 dark:bg-slate-800/60"
      : "sticky top-0 z-10 border-b border-brand-200 bg-brand-50/60 p-2 dark:border-slate-700 dark:bg-slate-800/70";
  const plugins = [
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    ...(jsxComponentDescriptors.length > 0 ? [jsxPlugin({ jsxComponentDescriptors })] : []),
    markdownShortcutPlugin(),
    toolbarPlugin({
      toolbarClassName,
      toolbarContents: () => (
        <DomoraToolbar>
          {hasInsertOptions ? (
            <span className="ml-1 inline-flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <select
                    className="h-8 max-w-[220px] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                    value={resolvedInsertValue}
                    onChange={(event) => setSelectedInsertValue(event.target.value)}
                    aria-label={insertPlaceholder}
                  >
                    {insertOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </TooltipTrigger>
                <TooltipContent>{insertPlaceholder}</TooltipContent>
              </Tooltip>
              <button
                type="button"
                className="h-8 rounded-md border border-brand-300 bg-white px-2 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50 dark:border-brand-700 dark:bg-slate-900 dark:text-brand-300 dark:hover:bg-slate-800"
                onClick={() => {
                  if (!resolvedInsertValue) {
                    return;
                  }
                  editorRef.current?.focus(() => {
                    editorRef.current?.insertMarkdown(`\n\n${resolvedInsertValue}\n\n`);
                  }, { defaultSelection: "rootEnd" });
                }}
              >
                {insertButtonLabel}
              </button>
            </span>
          ) : null}
        </DomoraToolbar>
      )
    })
  ];

  return (
    <div
      className={containerClassName}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("text/domora-widget-index")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("text/domora-widget-index")) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <MDXEditor
        ref={editorRef}
        markdown={value}
        onChange={onChange}
        placeholder={placeholder}
        className="text-sm text-slate-900 dark:text-slate-100"
        contentEditableClassName={editorTypographyClassName}
        plugins={plugins}
      />
    </div>
  );
};
