import ReactMarkdown, { type Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

import { extractTextContent, slugifyHeading } from '@/lib/utils';

const markdownComponents: Components = {
  h1() {
    return null;
  },
  h2({ children, ...props }) {
    const text = extractTextContent(children);
    const id = slugifyHeading(text);

    return (
      <h2 id={id} className="mt-10 scroll-mt-28 border-b border-gray-100 pb-2 text-2xl font-bold text-[#1C2833]" {...props}>
        {children}
      </h2>
    );
  },
  h3({ children, ...props }) {
    const text = extractTextContent(children);
    const id = slugifyHeading(text);

    return (
      <h3 id={id} className="mt-8 scroll-mt-28 text-xl font-bold text-[#1C2833]" {...props}>
        {children}
      </h3>
    );
  },
  p({ children, ...props }) {
    return (
      <p className="text-[#34495E]" {...props}>
        {children}
      </p>
    );
  },
  ul({ children, ...props }) {
    return (
      <ul className="text-[#34495E]" {...props}>
        {children}
      </ul>
    );
  },
  ol({ children, ...props }) {
    return (
      <ol className="text-[#34495E]" {...props}>
        {children}
      </ol>
    );
  },
  code({ className, children, ...props }) {
    const inline = !className;

    if (inline) {
      return (
        <code className="rounded bg-[#F0F8FF] px-1.5 py-0.5 text-sm text-[#1C2833]" {...props}>
          {children}
        </code>
      );
    }

    const match = /language-(\w+)/u.exec(className || '');

    return (
      <div className="my-6 overflow-hidden rounded-[16px] bg-[#1C2833] shadow-lg">
        <div className="flex items-center gap-2 border-b border-gray-800 bg-[#111822] px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-[#FF5F56]" />
          <div className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
          <div className="h-3 w-3 rounded-full bg-[#27C93F]" />
          <span className="ml-2 font-mono text-xs text-gray-400">{match?.[1] ?? 'text'}</span>
        </div>
        <div className="overflow-x-auto p-2">
          <SyntaxHighlighter
            style={oneLight}
            language={match?.[1] ?? 'text'}
            PreTag="div"
            customStyle={{
              borderRadius: '0',
              padding: '1rem',
              margin: 0,
              background: 'transparent',
              fontSize: '0.92rem'
            }}
          >
            {String(children).replace(/\n$/u, '')}
          </SyntaxHighlighter>
        </div>
      </div>
    );
  }
};

export function ReadingMarkdown({ body }: { body: string }) {
  return (
    <article className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-[#1C2833] prose-p:text-[#34495E] prose-p:leading-[1.9] prose-a:text-[#66CCFF] prose-strong:text-[#1C2833] prose-blockquote:rounded-r-[16px] prose-blockquote:border-l-[4px] prose-blockquote:border-[#66CCFF] prose-blockquote:bg-[#F0F8FF] prose-blockquote:px-6 prose-blockquote:py-3 prose-li:text-[#34495E]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {body}
      </ReactMarkdown>
    </article>
  );
}
