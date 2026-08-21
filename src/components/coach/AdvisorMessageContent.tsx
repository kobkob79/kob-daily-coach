import { Fragment, type ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g).map((part, index) =>
    (part.startsWith("**") && part.endsWith("**")) ||
    (part.startsWith("__") && part.endsWith("__")) ? (
      <strong key={index} className="font-bold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function isHeading(line: string): boolean {
  return (
    /^#{1,3}\s+/.test(line) ||
    (/^(?:\*\*|__).+(?:\*\*|__)$/.test(line) && line.length <= 80) ||
    (line.endsWith(":") && line.length <= 72)
  );
}

function headingText(line: string): string {
  return line
    .replace(/^#{1,3}\s+/, "")
    .replace(/^(?:\*\*|__)/, "")
    .replace(/(?:\*\*|__)$/, "");
}

function splitLongParagraph(text: string): string[] {
  if (text.length <= 190) return [text];

  const sentences = text.match(/[^.!?…]+[.!?…]?/g)?.map((sentence) => sentence.trim()) ?? [text];
  const paragraphs: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && `${current} ${sentence}`.length > 190) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current) paragraphs.push(current);
  return paragraphs;
}

export function AdvisorMessageContent({ text }: { text: string }) {
  const normalizedText = text.includes("\n") ? text : text.replace(/\\n/g, "\n");
  const lines = normalizedText.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (isHeading(line)) {
      blocks.push(
        <h3
          key={`heading-${index}`}
          className="mb-2 mt-4 text-[0.95rem] font-extrabold leading-6 text-foreground first:mt-0"
        >
          {renderInline(headingText(line))}
        </h3>,
      );
      index += 1;
      continue;
    }

    const unordered = line.match(/^[-*+•–]\s+(.+)$/);
    if (unordered) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^[-*+•–]\s+(.+)$/);
        if (!item) break;
        items.push(<li key={index}>{renderInline(item[1])}</li>);
        index += 1;
      }
      blocks.push(
        <ul
          key={`list-${index}`}
          className="my-3 list-outside list-disc space-y-2 pe-6 leading-6 marker:text-primary"
        >
          {items}
        </ul>,
      );
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(<li key={index}>{renderInline(item[1])}</li>);
        index += 1;
      }
      blocks.push(
        <ol
          key={`list-${index}`}
          className="my-3 list-outside list-decimal space-y-2 pe-6 leading-6 marker:font-semibold marker:text-primary"
        >
          {items}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (
        !current ||
        isHeading(current) ||
        /^[-*+•–]\s+/.test(current) ||
        /^\d+[.)]\s+/.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }

    const readableParagraphs = paragraph.flatMap(splitLongParagraph);
    readableParagraphs.forEach((part, partIndex) => {
      blocks.push(
        <p key={`paragraph-${index}-${partIndex}`} className="mb-3 last:mb-0">
          {renderInline(part)}
        </p>,
      );
    });
  }

  return <div className="break-words text-sm leading-6 text-foreground/90">{blocks}</div>;
}
