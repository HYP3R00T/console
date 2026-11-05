"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Render model output as Markdown without executing embedded HTML. */
export function MessageMarkdown({ text }: { text: string }) {
  return (
    <div className="message-markdown min-w-0 text-sm leading-7">
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
