import { useMemo, useRef, useState } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  UndoRedo,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin
} from "@mdxeditor/editor";

interface MXEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
  chrome?: "card" | "flat";
  insertOptions?: Array<{ label: string; value: string }>;
  insertPlaceholder?: string;
  insertButtonLabel?: string;
}

export const MXEditor = ({
  value,
  onChange,
  placeholder,
  minHeightClassName = "min-h-[300px]",
  chrome = "card",
  insertOptions = [],
  insertPlaceholder = "Baustein",
  insertButtonLabel = "Einfügen"
}: MXEditorProps) => {
  const editorRef = useRef<MDXEditorMethods>(null);
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

  return (
    <div className={containerClassName}>
      <MDXEditor
        ref={editorRef}
        markdown={value}
        onChange={onChange}
        placeholder={placeholder}
        className="text-sm text-slate-900 dark:text-slate-100"
        contentEditableClassName={editorTypographyClassName}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarClassName,
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                <ListsToggle />
                <CreateLink />
                {hasInsertOptions ? (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <select
                      className="h-8 max-w-[220px] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      value={resolvedInsertValue}
                      onChange={(event) => setSelectedInsertValue(event.target.value)}
                      aria-label={insertPlaceholder}
                      title={insertPlaceholder}
                    >
                      {insertOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="h-8 rounded-md border border-brand-300 bg-white px-2 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:bg-slate-900 dark:text-brand-300 dark:hover:bg-slate-800"
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
              </>
            )
          })
        ]}
      />
    </div>
  );
};
