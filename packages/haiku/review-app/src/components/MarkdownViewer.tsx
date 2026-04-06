import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  children: string;
  id?: string;
}

export function MarkdownViewer({ children, id }: Props) {
  return (
    <div
      id={id}
      className="prose prose-sm prose-stone dark:prose-invert max-w-none
        prose-code:bg-stone-100 prose-code:dark:bg-stone-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
        prose-pre:bg-stone-100 prose-pre:dark:bg-stone-800 prose-pre:rounded-lg
        prose-table:border-collapse prose-th:border prose-th:border-stone-300 prose-th:dark:border-stone-600 prose-th:px-3 prose-th:py-1.5
        prose-td:border prose-td:border-stone-300 prose-td:dark:border-stone-600 prose-td:px-3 prose-td:py-1.5"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
