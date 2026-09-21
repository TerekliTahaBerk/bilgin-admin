"use client";

import { Keyboard } from "lucide-react";
import { useEffect, useState } from "react";

type ShortcutEntry = Readonly<{
  keys: readonly string[];
  description: string;
}>;

const GLOBAL_SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: ["⌘/Ctrl", "K"], description: "Panelde ara (sayfalar ve dersler)" },
  { keys: ["Esc"], description: "Açık pencereyi/aramayı kapat" },
  { keys: ["?"], description: "Bu kısayol rehberini aç" },
];

const EDITOR_SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: ["⌘/Ctrl", "S"], description: "Soruyu kaydet" },
  {
    keys: ["⌘/Ctrl", "Shift", "Enter"],
    description: "Kaydet ve aynı bağlamda yeni soru aç",
  },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;

  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function KeyCombo({ keys }: Readonly<{ keys: readonly string[] }>) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, index) => (
        <span className="inline-flex items-center gap-1" key={key}>
          {index === 0 ? null : (
            <span aria-hidden="true" className="text-xs text-muted">
              +
            </span>
          )}
          <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[11px]">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

/**
 * Self-contained like `CommandPalette`: owns its own open state and its own
 * "?" listener. Ignored while typing in a field, so it never intercepts a
 * literal "?" character in a search box or textarea.
 */
export function ShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (
        event.key === "?" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      <button
        aria-label="Klavye kısayollarını göster"
        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:bg-surface-muted"
        onClick={() => setIsOpen(true)}
        title="Klavye kısayolları (?)"
        type="button"
      >
        <Keyboard aria-hidden="true" className="size-4" />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Kısayol rehberini kapat"
            className="absolute inset-0 h-full w-full bg-foreground/40"
            onClick={() => setIsOpen(false)}
            tabIndex={-1}
            type="button"
          />

          <div
            aria-label="Klavye kısayolları"
            aria-modal="true"
            className="relative mx-auto mt-24 w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
            role="dialog"
          >
            <h2 className="text-sm font-semibold">Klavye Kısayolları</h2>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted">Genel</p>
                <ul className="mt-2 space-y-2">
                  {GLOBAL_SHORTCUTS.map((entry) => (
                    <li
                      className="flex items-center justify-between gap-3 text-sm"
                      key={entry.description}
                    >
                      <span>{entry.description}</span>
                      <KeyCombo keys={entry.keys} />
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs font-medium text-muted">
                  Soru Düzenleyici
                </p>
                <ul className="mt-2 space-y-2">
                  {EDITOR_SHORTCUTS.map((entry) => (
                    <li
                      className="flex items-center justify-between gap-3 text-sm"
                      key={entry.description}
                    >
                      <span>{entry.description}</span>
                      <KeyCombo keys={entry.keys} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
