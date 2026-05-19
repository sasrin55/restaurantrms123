import { useState, useRef, useEffect } from "react";
import { X, Plus, Tag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { GuestTagOption } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function textColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a1a1a" : "#ffffff";
}

// ── GuestTagBadge ─────────────────────────────────────────────────────────────
// Single colored tag pill

interface GuestTagBadgeProps {
  label: string;
  color: string;
  onRemove?: () => void;
  size?: "sm" | "xs";
  testId?: string;
}

export function GuestTagBadge({ label, color, onRemove, size = "sm", testId }: GuestTagBadgeProps) {
  const fg = textColor(color);
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${pad}`}
      style={{ backgroundColor: color, color: fg }}
      data-testid={testId}
    >
      {label}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="rounded-full hover:opacity-70 transition-opacity leading-none"
          aria-label={`Remove ${label}`}
          data-testid={`button-remove-tag-${label}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

// ── GuestTagChips ─────────────────────────────────────────────────────────────
// Compact display of tags (max N visible + overflow badge)

interface GuestTagChipsProps {
  tags: string[];
  tagOptions: GuestTagOption[];
  max?: number;
  size?: "sm" | "xs";
  className?: string;
}

export function GuestTagChips({ tags, tagOptions, max = 2, size = "xs", className = "" }: GuestTagChipsProps) {
  if (!tags || tags.length === 0) return null;

  const optionMap = new Map(tagOptions.map(t => [t.label, t.color]));
  const visible = tags.slice(0, max);
  const overflow = tags.length - max;

  return (
    <div className={`flex items-center flex-wrap gap-1 ${className}`}>
      {visible.map(tag => (
        <GuestTagBadge
          key={tag}
          label={tag}
          color={optionMap.get(tag) ?? "#6b7280"}
          size={size}
        />
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground whitespace-nowrap">
          +{overflow}
        </span>
      )}
    </div>
  );
}

// ── GuestTagPicker ────────────────────────────────────────────────────────────
// Multi-select dropdown for picking tags

interface GuestTagPickerProps {
  value: string[];
  onChange: (tags: string[]) => void;
  tagOptions: GuestTagOption[];
  placeholder?: string;
  testId?: string;
}

export function GuestTagPicker({ value, onChange, tagOptions, placeholder = "Add tags", testId }: GuestTagPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (label: string) => {
    onChange(value.includes(label) ? value.filter(t => t !== label) : [...value, label]);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(tag => {
            const opt = tagOptions.find(o => o.label === tag);
            return (
              <GuestTagBadge
                key={tag}
                label={tag}
                color={opt?.color ?? "#6b7280"}
                onRemove={() => toggle(tag)}
                testId={`tag-selected-${tag}`}
              />
            );
          })}
        </div>
      )}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-[#0D7377] hover:text-[#0D7377] transition-colors"
          data-testid={testId}
        >
          <Tag className="h-3.5 w-3.5" />
          {value.length === 0 ? placeholder : `${value.length} tag${value.length !== 1 ? "s" : ""} selected`}
          <Plus className="h-3 w-3" />
        </button>
        {open && tagOptions.length > 0 && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[200px]">
            {tagOptions.map(opt => {
              const selected = value.includes(opt.label);
              return (
                <label
                  key={opt.id}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
                  data-testid={`tag-option-${opt.label}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(opt.label)}
                    className="rounded border-gray-300"
                  />
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: opt.color }}
                  />
                  <span className="text-xs text-gray-700 font-medium">{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── useTagOptions ─────────────────────────────────────────────────────────────
// Shared hook so pages don't each define their own query

export function useTagOptions() {
  return useQuery<GuestTagOption[]>({
    queryKey: ["/api/tags"],
    staleTime: 30_000,
  });
}
