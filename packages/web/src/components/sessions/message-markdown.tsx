"use client";

import { cn } from "cn";
import { isValidElement } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { InspectorCode } from "./inspector-code";

/** Render model output as Markdown without executing embedded HTML. */
export function MessageMarkdown({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "message-markdown min-w-0",
        compact ? "break-words text-xs leading-relaxed" : "text-sm leading-7",
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt, src }) => (
            <a
              href={typeof src === "string" ? src : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              {alt || "Image"}
            </a>
          ),
          ...(compact && {
            pre: ({ children }) => {
              if (
                !isValidElement<{ children?: unknown; className?: string }>(
                  children,
                ) ||
                typeof children.props.children !== "string"
              )
                return <pre>{children}</pre>;
              const language =
                children.props.className?.match(/language-([\w-]+)/)?.[1] ??
                "text";
              return (
                <InspectorCode
                  code={children.props.children}
                  language={language}
                />
              );
            },
          }),
          table: ({ children }) => (
            <div className="max-w-full overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
