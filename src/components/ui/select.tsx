"use client";

import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectChange = { target: { value: string }; currentTarget: { value: string } };
type Opt = { value: string; label: React.ReactNode; disabled: boolean; title?: string };

/** Read the <option> children (also inside fragments, arrays and map()) into a plain list. */
function readOptions(children: React.ReactNode): Opt[] {
  const out: Opt[] = [];
  const walk = (nodes: React.ReactNode) => {
    Children.toArray(nodes).forEach((n) => {
      if (!isValidElement(n)) return;
      const p = n.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean; title?: string };
      if (n.type === Fragment) return walk(p.children);
      if (n.type === "option") {
        const text = Children.toArray(p.children).filter((c) => typeof c === "string" || typeof c === "number").join("");
        out.push({ value: String(p.value ?? text), label: p.children, disabled: Boolean(p.disabled), title: p.title });
      }
    });
  };
  walk(children);
  return out;
}

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value" | "children"> & {
  value: string;
  onChange: (e: SelectChange) => void;
  children: React.ReactNode;
};

/**
 * A drop-in replacement for <select> whose list opens as a soft, rounded card (the browser's own list is a hard, square box that
 * cannot be styled). Same props: value, onChange(e.target.value), disabled, className, and <option> children.
 * Keyboard: ↑ ↓ Home End to move, Enter or Space to choose, Esc to close.
 */
export function Select({ value, onChange, children, className, disabled, ...rest }: Props) {
  const options = useMemo(() => readOptions(children), [children]);
  const current = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    const width = Math.max(r.width, 180);
    setBox({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      maxHeight: Math.max(160, Math.min(360, up ? above : below)),
    });
  }, []);

  const move = (from: number, step: 1 | -1) => {
    for (let i = from + step; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i;
    return from;
  };
  const choose = (o: Opt | undefined) => {
    if (!o || o.disabled) return;
    setOpen(false);
    trigger.current?.focus();
    if (o.value !== value) onChange({ target: { value: o.value }, currentTarget: { value: o.value } });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const i = options.findIndex((o) => o.value === value);
    setAt(i >= 0 ? i : move(-1, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    // on window, in the capture phase, so Esc closes only the list and not the dialog the list sits in
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const scrolled = (e: Event) => !list.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") (e.preventDefault(), setAt((i) => move(i, 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setAt((i) => move(i, -1)));
    else if (e.key === "Home") (e.preventDefault(), setAt(move(-1, 1)));
    else if (e.key === "End") (e.preventDefault(), setAt(move(options.length, -1)));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), choose(options[at]));
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <>
      <button
        {...rest}
        ref={trigger}
        type="button"
        role="combobox"
        data-select=""
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${at}` : undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(className, "flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60")}
      >
        <span className="min-w-0 flex-1 truncate">{current?.label ?? ""}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open &&
        box &&
        createPortal(
          <ul
            ref={list}
            id={id}
            role="listbox"
            style={{ position: "fixed", left: box.left, width: box.width, top: box.top, bottom: box.bottom, maxHeight: box.maxHeight }}
            className="select-pop z-[80] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_16px_48px_-16px_rgb(0_0_0/0.35)]"
          >
            {options.map((o, i) => {
              const selected = o.value === value;
              return (
                <li
                  key={o.value + i}
                  id={`${id}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={o.disabled || undefined}
                  title={o.title}
                  onMouseEnter={() => !o.disabled && setAt(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-sm transition-colors",
                    i === at && !o.disabled && "bg-muted",
                    selected && "font-bold",
                    o.disabled && "cursor-not-allowed opacity-45",
                  )}
                >
                  <span className="min-w-0 break-words">{o.label}</span>
                  {selected && <Check className="size-4 shrink-0" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
