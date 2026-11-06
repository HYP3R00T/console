"use client";

import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockLine,
} from "@/components/ui/code-block";
import { useHighlightedCode } from "@/hooks/use-highlighted-code";

export function InspectorCode({
  code,
  language,
  label = "Code",
}: {
  code: string;
  language: string;
  label?: string;
}) {
  const lines = useHighlightedCode(code, language);
  return (
    <CodeBlock size="sm">
      <CodeBlockActions>
        <CodeBlockCopyButton value={code} />
      </CodeBlockActions>
      <CodeBlockContent aria-label={label} wrap className="max-h-48">
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Code lines are positional.
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  );
}
