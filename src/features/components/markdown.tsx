import { useMemo } from "react";
import { Components } from "react-markdown";


export const useMarkdownComponents=()=>{
      const markdownComponents = useMemo<Components>(
        () => ({
          h1: ({ children }) => (
            <h1 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mt-2 leading-relaxed text-slate-700 dark:text-slate-300">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700 dark:text-slate-300">
              {children}
            </ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-600 dark:text-brand-300 dark:decoration-brand-700"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mt-3 border-l-4 border-brand-300 pl-3 italic text-slate-600 dark:border-brand-700 dark:text-slate-300">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => (
            <code
              className={`rounded bg-slate-100 px-1.5 py-0.5 text-[0.92em] dark:bg-slate-800 ${className ?? ""}`}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold dark:border-slate-700 dark:bg-slate-800">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-200 px-2 py-1 dark:border-slate-700">
              {children}
            </td>
          ),
        }),
        [],
      );

      return markdownComponents
}