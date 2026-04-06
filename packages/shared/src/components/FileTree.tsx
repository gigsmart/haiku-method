import { useState, type ReactNode } from "react";

interface FileTreeItem {
  name: string;
  path: string;
  isDirectory?: boolean;
  children?: FileTreeItem[];
}

interface Props {
  items: FileTreeItem[];
  onSelect?: (path: string) => void;
  renderContent?: (path: string) => ReactNode;
  className?: string;
}

export function FileTree({ items, onSelect, renderContent, className = "" }: Props) {
  return (
    <div className={`space-y-1 ${className}`}>
      {items.map((item) => (
        <FileTreeNode
          key={item.path}
          item={item}
          depth={0}
          onSelect={onSelect}
          renderContent={renderContent}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  item,
  depth,
  onSelect,
  renderContent,
}: {
  item: FileTreeItem;
  depth: number;
  onSelect?: (path: string) => void;
  renderContent?: (path: string) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.isDirectory && item.children && item.children.length > 0;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    } else {
      onSelect?.(item.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {hasChildren && (
          <svg
            className={`h-3.5 w-3.5 text-stone-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
        {!hasChildren && <span className="w-3.5" />}
        <span className={`font-mono text-xs ${item.isDirectory ? "text-stone-600 dark:text-stone-400 font-medium" : "text-stone-500 dark:text-stone-400"}`}>
          {item.name}
        </span>
      </button>
      {expanded && hasChildren && (
        <div>
          {item.children!.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              onSelect={onSelect}
              renderContent={renderContent}
            />
          ))}
        </div>
      )}
      {expanded && !hasChildren && renderContent && (
        <div className="border-t border-stone-100 px-4 py-4 dark:border-stone-800" style={{ marginLeft: `${depth * 16 + 12}px` }}>
          {renderContent(item.path)}
        </div>
      )}
    </div>
  );
}
