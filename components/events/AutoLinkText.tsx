import { splitTextWithUrls } from "@/lib/events/autolink";
import { cn } from "@/lib/utils";

/**
 * Renders plain text with absolute http(s) URLs as safe external anchors.
 * Does not interpret HTML — all non-URL content stays as React text nodes.
 */
export function AutoLinkText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const segments = splitTextWithUrls(text);

  return (
    <p
      className={cn(
        "whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)]/90",
        className
      )}
    >
      {segments.map((segment, i) => {
        if (segment.type === "text") {
          return <span key={i}>{segment.value}</span>;
        }
        return (
          <a
            key={i}
            href={segment.value}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {segment.value}
          </a>
        );
      })}
    </p>
  );
}
