"use client";

import { Badge, Button, TextInput } from "@/components/ui";
import { shorten } from "@/lib/format";
import type { Persona } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

type TabsProps = {
  personas: Persona[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
};

/**
 * Persona switcher. The pill behind the active tab slides between tabs instead of
 * blinking on and off, so switching feels like moving something rather than
 * re-rendering something.
 */
export function PersonaTabs({ personas, activeId, onSelect, onAdd }: TabsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const el = tabRefs.current[activeId];
      const track = trackRef.current;
      if (!el || !track) return;
      // Measure the delta between the tab and the track so the pill lands exactly on it,
      // whatever padding the track has.
      const delta = el.getBoundingClientRect().left - track.getBoundingClientRect().left;
      setIndicator({ left: delta, width: el.offsetWidth });
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    update();
    const observer = new ResizeObserver(update);
    if (trackRef.current) observer.observe(trackRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [activeId, personas]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = personas.findIndex((persona) => persona.id === activeId);
    if (index < 0) return;

    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % personas.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + personas.length) % personas.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = personas.length - 1;

    if (next < 0) return;
    event.preventDefault();
    const target = personas[next];
    onSelect(target.id);
    tabRefs.current[target.id]?.focus();
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 overflow-x-auto scrollbar-slim" role="tablist" aria-label="Personas" onKeyDown={onKeyDown}>
        <div ref={trackRef} className="relative flex w-max gap-1 rounded-full bg-neutral-900/60 p-1">
          {indicator && (
            <span
              aria-hidden
              className="absolute top-1 bottom-1 left-0 rounded-full bg-neutral-800 ring-1 ring-white/5 transition-[transform,width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
              style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
            />
          )}
          {personas.map((persona) => {
            const active = persona.id === activeId;
            return (
              <button
                key={persona.id}
                ref={(el) => {
                  tabRefs.current[persona.id] = el;
                }}
                role="tab"
                id={`persona-tab-${persona.id}`}
                aria-selected={active}
                aria-controls={`persona-panel-${persona.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelect(persona.id)}
                className={`relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                  active ? "text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {persona.role === "professor" && (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
                {persona.name}
              </button>
            );
          })}
        </div>
      </div>
      <Button onClick={onAdd} title="Add another persona">
        + Persona
      </Button>
    </div>
  );
}

type HeaderProps = {
  persona: Persona;
  connected?: string;
  onRename: (name: string) => void;
  onRemove: () => void;
  onSetWallet: (wallet: string | undefined) => void;
};

/** Details of the active persona: who it is, which wallet it acts from. */
export function PersonaHeader({ persona, connected, onRename, onRemove, onSetWallet }: HeaderProps) {
  const [draft, setDraft] = useState(persona.name);
  const [lastName, setLastName] = useState(persona.name);

  // Adjusting state while rendering is the documented way to follow a changed prop.
  if (persona.name !== lastName) {
    setLastName(persona.name);
    setDraft(persona.name);
  }

  const connectedMatches = connected && persona.wallet && connected.toLowerCase() === persona.wallet.toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone={persona.role === "professor" ? "emerald" : "neutral"}>
        {persona.role === "professor" ? "Professor" : "Student"}
      </Badge>

      <TextInput
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onRename(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        aria-label="Persona name"
        className="w-40 border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-neutral-800 focus:border-neutral-800"
      />

      {persona.wallet ? (
        <span className="flex items-center gap-2 rounded-md border border-neutral-800 px-2.5 py-1 font-mono text-xs text-neutral-400">
          {shorten(persona.wallet, 4)}
          {connectedMatches && <Badge tone="emerald">connected</Badge>}
          <button
            onClick={() => onSetWallet(undefined)}
            aria-label="Clear bound wallet"
            className="text-neutral-600 transition-colors duration-150 hover:text-neutral-300"
          >
            ×
          </button>
        </span>
      ) : connected ? (
        <button
          onClick={() => onSetWallet(connected)}
          className="rounded-md border border-dashed border-neutral-800 px-2.5 py-1 text-xs text-neutral-500 transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-neutral-700 hover:text-neutral-300"
        >
          Bind wallet {shorten(connected, 4)}
        </button>
      ) : (
        <span className="text-xs text-neutral-600">no wallet connected</span>
      )}

      {persona.role === "student" && (
        <Button variant="danger" onClick={onRemove} className="ml-auto">
          Remove persona
        </Button>
      )}
    </div>
  );
}
