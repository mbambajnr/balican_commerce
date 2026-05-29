"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { MagnifyingGlass, Check } from "@phosphor-icons/react";

interface Product {
  id: string;
  name: string;
  sku?: string;
  category_name?: string;
}

interface ProductSearchSelectProps {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
}

export default function ProductSearchSelect({ products, value, onChange, placeholder = "Search products..." }: ProductSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => products.find((p) => p.id === value), [products, value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return products.slice(0, 100);
    const q = query.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category_name && p.category_name.toLowerCase().includes(q))
    ).slice(0, 100);
  }, [products, query]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[highlightIdx]) {
          handleSelect(filtered[highlightIdx].id);
        }
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightIdx] as HTMLElement;
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.parentElement?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selected ? `${selected.name}${selected.sku ? ` (${selected.sku})` : ""}` : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (selected) {
              setQuery(selected.name);
            }
          }}
          onKeyDown={handleKeyDown}
          className="input pl-9"
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
        />
      </div>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-border bg-white shadow-lg"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              No products found
            </div>
          ) : (
            filtered.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={p.id === value}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  i === highlightIdx
                    ? "bg-accent/10 text-accent-bold"
                    : p.id === value
                    ? "bg-accent/5 text-ink"
                    : "text-ink hover:bg-zinc-50"
                }`}
                onMouseEnter={() => setHighlightIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(p.id);
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {p.sku && <span className="font-mono">{p.sku}</span>}
                    {p.category_name && <span>{p.category_name}</span>}
                  </div>
                </div>
                {p.id === value && (
                  <Check size={16} weight="bold" className="text-accent shrink-0" />
                )}
              </button>
            ))
          )}
          {products.length > 100 && (
            <div className="border-t border-border px-4 py-2 text-xs text-muted text-center">
              {filtered.length < products.length
                ? `${filtered.length} of ${products.length} products`
                : `Showing first 100 of ${products.length} products — type to narrow`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
