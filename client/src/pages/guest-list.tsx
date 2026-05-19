import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { differenceInDays, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search, Users, Phone, Calendar, Loader2, Trash2,
  Star, ShoppingCart, UserX, Eye, EyeOff, ChevronDown, X,
} from "lucide-react";
import { format, parseISO as parseDateISO } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatName, isValidPhone } from "@/lib/utils";
import { GuestTagChips, GuestTagPicker, useTagOptions } from "@/components/guest-tags";
import type { GuestTagOption } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Guest {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  lastVisit: string;
  totalPartySize: number;
  noShowCount: number;
  cancelCount: number;
  isWalkIn: boolean;
  depositRequired: boolean;
  tags: string[];
  notes: string;
  dietaryNotes: string;
}

interface GuestAnalytics {
  favouriteItems: { name: string; quantity: number }[];
  totalOrders: number;
  totalItemsOrdered: number;
  avgItemsPerOrder: number;
}

// ── Filter types ──────────────────────────────────────────────────────────────
type VisitFilter    = "all" | "new" | "repeat" | "regular" | "frequent";
type LastVisitFilter = "any" | "7d" | "30d" | "30-90d" | "90d-6m" | "6m";
type RiskFlag       = "high-noshow" | "high-cancel" | "deposit";
type NotesFilter    = "any" | "dietary" | "general" | "none";

interface Filters {
  visits:    VisitFilter;
  lastVisit: LastVisitFilter;
  tags:      string[];
  risk:      RiskFlag[];
  notes:     NotesFilter;
}

const DEFAULT_FILTERS: Filters = {
  visits:    "all",
  lastVisit: "any",
  tags:      [],
  risk:      [],
  notes:     "any",
};

// ── URL param helpers ─────────────────────────────────────────────────────────
function readFiltersFromSearch(search: string): Filters {
  const p = new URLSearchParams(search);
  return {
    visits:    (p.get("visits")    as VisitFilter)    || "all",
    lastVisit: (p.get("lastVisit") as LastVisitFilter) || "any",
    tags:      p.get("tags")  ? p.get("tags")!.split(",").filter(Boolean)  : [],
    risk:      p.get("risk")  ? (p.get("risk")!.split(",") as RiskFlag[])  : [],
    notes:     (p.get("notes") as NotesFilter) || "any",
  };
}

function filtersToSearch(f: Filters, existingSearch: string): string {
  const p = new URLSearchParams(existingSearch);
  if (f.visits    !== "all") p.set("visits",    f.visits);    else p.delete("visits");
  if (f.lastVisit !== "any") p.set("lastVisit", f.lastVisit); else p.delete("lastVisit");
  if (f.tags.length)         p.set("tags",      f.tags.join(","));  else p.delete("tags");
  if (f.risk.length)         p.set("risk",      f.risk.join(","));  else p.delete("risk");
  if (f.notes     !== "any") p.set("notes",     f.notes);    else p.delete("notes");
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ── Filter helpers ────────────────────────────────────────────────────────────
const VISIT_LABELS: Record<VisitFilter, string>     = { all: "All guests", new: "New (1 visit)", repeat: "Repeat (2–5)", regular: "Regular (6–15)", frequent: "Frequent (16+)" };
const LAST_VISIT_LABELS: Record<LastVisitFilter, string> = { any: "Any time", "7d": "Last 7 days", "30d": "Last 30 days", "30-90d": "30–90 days ago", "90d-6m": "3–6 months ago", "6m": "Lapsed (6 m+)" };
const RISK_LABELS: Record<RiskFlag, string>         = { "high-noshow": "High no-show rate (>20%)", "high-cancel": "High cancel rate (>30%)", deposit: "Deposit required" };
const NOTES_LABELS: Record<NotesFilter, string>     = { any: "Any", dietary: "Has dietary notes", general: "Has general notes", none: "Has no notes" };

function guestTotalResos(g: Guest) {
  return g.visitCount + g.noShowCount + (g.cancelCount ?? 0);
}

function passesFilters(g: Guest, f: Filters): boolean {
  // Visit count
  if (f.visits !== "all") {
    const vc = g.visitCount;
    if (f.visits === "new"      && vc !== 1)           return false;
    if (f.visits === "repeat"   && (vc < 2 || vc > 5)) return false;
    if (f.visits === "regular"  && (vc < 6 || vc > 15))return false;
    if (f.visits === "frequent" && vc < 16)             return false;
  }

  // Last visit
  if (f.lastVisit !== "any" && g.lastVisit) {
    let days = 0;
    try { days = differenceInDays(new Date(), parseISO(g.lastVisit)); } catch {}
    if (f.lastVisit === "7d"     && days >  7)          return false;
    if (f.lastVisit === "30d"    && days > 30)          return false;
    if (f.lastVisit === "30-90d" && (days < 30 || days > 90))  return false;
    if (f.lastVisit === "90d-6m" && (days < 90 || days > 180)) return false;
    if (f.lastVisit === "6m"     && days <= 180)        return false;
  }

  // Tags
  if (f.tags.length > 0) {
    const hasTagged   = f.tags.filter(t => t !== "untagged");
    const wantUntagged = f.tags.includes("untagged");
    const gTags       = g.tags ?? [];
    const matchesTag   = hasTagged.some(t => gTags.includes(t));
    const matchesUntag = wantUntagged && gTags.length === 0;
    if (!matchesTag && !matchesUntag) return false;
  }

  // Risk
  if (f.risk.length > 0) {
    const total      = guestTotalResos(g);
    const nsRate     = total > 0 ? g.noShowCount / total : 0;
    const cancelRate = total > 0 ? (g.cancelCount ?? 0) / total : 0;
    const passes = f.risk.some(r => {
      if (r === "high-noshow"  && nsRate > 0.20)       return true;
      if (r === "high-cancel"  && cancelRate > 0.30)   return true;
      if (r === "deposit"      && g.depositRequired)    return true;
      return false;
    });
    if (!passes) return false;
  }

  // Notes
  if (f.notes === "dietary" && !g.dietaryNotes?.trim()) return false;
  if (f.notes === "general" && !g.notes?.trim())        return false;
  if (f.notes === "none"    && (g.notes?.trim() || g.dietaryNotes?.trim())) return false;

  return true;
}

function isFiltersActive(f: Filters): boolean {
  return f.visits !== "all" || f.lastVisit !== "any" || f.tags.length > 0 || f.risk.length > 0 || f.notes !== "any";
}

// ── Chip list for active filters ──────────────────────────────────────────────
function FilterChips({ filters, onRemove, onClear }: {
  filters: Filters;
  onRemove: (key: keyof Filters, value?: string) => void;
  onClear: () => void;
}) {
  const chips: { label: string; key: keyof Filters; value?: string }[] = [];

  if (filters.visits !== "all")
    chips.push({ label: VISIT_LABELS[filters.visits], key: "visits" });
  if (filters.lastVisit !== "any")
    chips.push({ label: LAST_VISIT_LABELS[filters.lastVisit], key: "lastVisit" });
  filters.tags.forEach(t =>
    chips.push({ label: t === "untagged" ? "Untagged" : `Tag: ${t}`, key: "tags", value: t }));
  filters.risk.forEach(r =>
    chips.push({ label: RISK_LABELS[r], key: "risk", value: r }));
  if (filters.notes !== "any")
    chips.push({ label: NOTES_LABELS[filters.notes], key: "notes" });

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-xs bg-[#0D7377]/10 text-[#0D7377] px-2 py-1 rounded-full font-medium"
          data-testid={`chip-filter-${c.key}-${c.value ?? "value"}`}
        >
          {c.label}
          <button
            onClick={() => onRemove(c.key, c.value)}
            className="hover:text-[#0a5457] transition-colors ml-0.5"
            aria-label={`Remove ${c.label} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        onClick={onClear}
        className="text-xs text-gray-400 hover:text-gray-600 underline ml-1 transition-colors"
        data-testid="button-clear-all-filters"
      >
        Clear all
      </button>
    </div>
  );
}

// ── Single-select dropdown ─────────────────────────────────────────────────────
function SingleSelect<T extends string>({ value, onChange, options, placeholder, testId }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  const isDefault = value === options[0]?.value;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap",
          isDefault
            ? "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            : "bg-[#0D7377]/10 text-[#0D7377] border-[#0D7377]/30",
        ].join(" ")}
        data-testid={testId}
      >
        {isDefault ? placeholder : selected?.label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[180px]">
          {options.map(o => (
            <button
              key={o.value}
              className={[
                "w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center justify-between",
                o.value === value ? "text-[#0D7377] font-medium" : "text-gray-700",
              ].join(" ")}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
              {o.value === value && <span className="w-1.5 h-1.5 rounded-full bg-[#0D7377]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Multi-select dropdown ─────────────────────────────────────────────────────
function MultiSelect<T extends string>({ value, onChange, options, placeholder, testId }: {
  value: T[];
  onChange: (v: T[]) => void;
  options: { value: T; label: string; color?: string }[];
  placeholder: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isDefault = value.length === 0;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle(v: T) {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap",
          isDefault
            ? "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            : "bg-[#0D7377]/10 text-[#0D7377] border-[#0D7377]/30",
        ].join(" ")}
        data-testid={testId}
      >
        {isDefault ? placeholder : `${placeholder} (${value.length})`}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[220px]">
          {options.map(o => (
            <label
              key={o.value}
              className="flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="rounded border-gray-300 accent-[#0D7377]"
              />
              {o.color && (
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: o.color }} />
              )}
              {o.label}
            </label>
          ))}
          {value.length > 0 && (
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={() => onChange([])}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Order stats (lazy per card) ───────────────────────────────────────────────
function GuestOrderStats({ guestId }: { guestId: string }) {
  const { data } = useQuery<GuestAnalytics>({
    queryKey: ["/api/analytics/guests", guestId],
    staleTime: 0,
    refetchOnMount: "always",
  });
  if (!data || data.totalOrders === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShoppingCart className="h-3 w-3" />
          <span data-testid={`text-guest-orders-${guestId}`}>
            {data.totalOrders} order{data.totalOrders !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span data-testid={`text-guest-avg-items-${guestId}`}>~{data.avgItemsPerOrder} items/order</span>
        </div>
      </div>
      {data.favouriteItems.length > 0 && (
        <div className="flex items-start gap-1.5">
          <Star className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex flex-wrap gap-1" data-testid={`text-guest-favourites-${guestId}`}>
            {data.favouriteItems.slice(0, 3).map(item => (
              <Badge key={item.name} variant="secondary" className="text-xs">
                {item.name} ({item.quantity})
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GuestListPage() {
  const [, navigate] = useLocation();

  // Read filters from URL on mount and on navigation
  const [searchQuery, setSearchQuery] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("q") || "";
  });
  const [filters, setFilters] = useState<Filters>(() =>
    readFiltersFromSearch(window.location.search)
  );
  const [showHidden, setShowHidden] = useState(false);

  // Sync URL whenever filters or search change
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (searchQuery) p.set("q", searchQuery); else p.delete("q");

    // Build filter params
    const next = new URLSearchParams(p.toString());
    if (filters.visits    !== "all") next.set("visits",    filters.visits);    else next.delete("visits");
    if (filters.lastVisit !== "any") next.set("lastVisit", filters.lastVisit); else next.delete("lastVisit");
    if (filters.tags.length)         next.set("tags",      filters.tags.join(","));  else next.delete("tags");
    if (filters.risk.length)         next.set("risk",      filters.risk.join(","));  else next.delete("risk");
    if (filters.notes     !== "any") next.set("notes",     filters.notes);    else next.delete("notes");
    if (searchQuery)                 next.set("q",         searchQuery);      else next.delete("q");

    const qs = next.toString();
    const target = `/guests${qs ? `?${qs}` : ""}`;
    if (window.location.pathname + window.location.search !== target) {
      navigate(target, { replace: true });
    }
  }, [filters, searchQuery]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(f => ({ ...f, [key]: value }));
  }

  function removeFilterChip(key: keyof Filters, value?: string) {
    if (key === "tags" && value) {
      setFilters(f => ({ ...f, tags: f.tags.filter(t => t !== value) }));
    } else if (key === "risk" && value) {
      setFilters(f => ({ ...f, risk: f.risk.filter(r => r !== value) as RiskFlag[] }));
    } else if (key === "visits")    setFilters(f => ({ ...f, visits: "all" }));
    else if (key === "lastVisit")   setFilters(f => ({ ...f, lastVisit: "any" }));
    else if (key === "notes")       setFilters(f => ({ ...f, notes: "any" }));
  }

  function clearAllFilters() {
    setFilters(DEFAULT_FILTERS);
    setSearchQuery("");
  }

  const { data: guests = [], isLoading } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
  });

  const { data: tagOptionData = [] } = useTagOptions();

  const deleteGuestMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/guests/${id}`),
    onSuccess:  () => queryClient.refetchQueries({ queryKey: ["/api/guests"] }),
  });

  const updateTagsMutation = useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
      apiRequest("PATCH", `/api/guests/${id}`, { tags }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/guests"] }),
  });

  // Partition valid vs hidden
  const validGuests  = guests.filter(g => isValidPhone(g.phone) && !g.isWalkIn);
  const hiddenGuests = guests.filter(g => !isValidPhone(g.phone) || g.isWalkIn);
  const baseGuests   = showHidden ? guests : validGuests;

  // Tag filter options: "Untagged" + all options from API
  const tagFilterOptions = useMemo<{ value: string; label: string; color?: string }[]>(() => [
    { value: "untagged", label: "Untagged" },
    ...tagOptionData.map(t => ({ value: t.label, label: t.label, color: t.color })),
  ], [tagOptionData]);

  // Apply filters then search
  const filteredGuests = useMemo(() => {
    let result = baseGuests.filter(g => passesFilters(g, filters));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(g =>
        g.name.toLowerCase().includes(q) || g.phone.includes(q)
      );
    }
    return result;
  }, [baseGuests, filters, searchQuery]);

  const filtersActive = isFiltersActive(filters);

  const getInitials = (name: string) =>
    formatName(name).split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const formatLastVisit = (dateStr: string) => {
    try { return format(parseDateISO(dateStr), "MMM d, yyyy"); } catch { return dateStr; }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-lg sm:text-3xl font-semibold text-foreground mb-0.5 sm:mb-1" data-testid="text-page-title">
            Guest List
          </h1>
          <p className="text-xs sm:text-base text-muted-foreground" data-testid="text-page-subtitle">
            Directory of all customers who have dined at your restaurant.
          </p>
        </div>

        {/* Search row */}
        <div className="flex items-center gap-2 sm:gap-3 mb-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 bg-background"
              data-testid="input-search-guests"
            />
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground shrink-0" data-testid="text-guest-count">
            {(filtersActive || searchQuery)
              ? `Showing ${filteredGuests.length} of ${baseGuests.length} guests`
              : `${filteredGuests.length} ${filteredGuests.length === 1 ? "guest" : "guests"}`
            }
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2 mb-3" data-testid="filter-row">
          <SingleSelect
            value={filters.visits}
            onChange={v => updateFilter("visits", v as VisitFilter)}
            options={[
              { value: "all",      label: "All guests" },
              { value: "new",      label: "New (1 visit)" },
              { value: "repeat",   label: "Repeat (2–5)" },
              { value: "regular",  label: "Regular (6–15)" },
              { value: "frequent", label: "Frequent (16+)" },
            ]}
            placeholder="Visit count"
            testId="select-filter-visits"
          />

          <SingleSelect
            value={filters.lastVisit}
            onChange={v => updateFilter("lastVisit", v as LastVisitFilter)}
            options={[
              { value: "any",     label: "Any time" },
              { value: "7d",      label: "Last 7 days" },
              { value: "30d",     label: "Last 30 days" },
              { value: "30-90d",  label: "30–90 days ago" },
              { value: "90d-6m",  label: "3–6 months ago" },
              { value: "6m",      label: "Lapsed (6 m+)" },
            ]}
            placeholder="Last visit"
            testId="select-filter-last-visit"
          />

          <MultiSelect
            value={filters.tags}
            onChange={v => updateFilter("tags", v)}
            options={tagFilterOptions}
            placeholder="Tags"
            testId="select-filter-tags"
          />

          <MultiSelect
            value={filters.risk}
            onChange={v => updateFilter("risk", v as RiskFlag[])}
            options={[
              { value: "high-noshow",  label: "High no-show rate (>20%)" },
              { value: "high-cancel",  label: "High cancel rate (>30%)" },
              { value: "deposit",      label: "Deposit required" },
            ]}
            placeholder="Risk flags"
            testId="select-filter-risk"
          />

          <SingleSelect
            value={filters.notes}
            onChange={v => updateFilter("notes", v as NotesFilter)}
            options={[
              { value: "any",      label: "Any" },
              { value: "dietary",  label: "Has dietary notes" },
              { value: "general",  label: "Has general notes" },
              { value: "none",     label: "Has no notes" },
            ]}
            placeholder="Notes"
            testId="select-filter-notes"
          />
        </div>

        {/* Active filter chips */}
        {filtersActive && (
          <FilterChips
            filters={filters}
            onRemove={removeFilterChip}
            onClear={clearAllFilters}
          />
        )}

        {/* Hidden toggle */}
        {hiddenGuests.length > 0 && (
          <button
            onClick={() => setShowHidden(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
            data-testid="button-toggle-hidden"
          >
            {showHidden
              ? <><EyeOff className="h-3.5 w-3.5" /> Hide {hiddenGuests.length} entries with invalid phones / walk-ins</>
              : <><Eye  className="h-3.5 w-3.5" /> Show {hiddenGuests.length} entries with invalid phones / walk-ins</>
            }
          </button>
        )}

        {/* Guest grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredGuests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2" data-testid="text-empty-title">
              {(searchQuery || filtersActive) ? "No guests match" : "No guests yet"}
            </h3>
            <p className="text-muted-foreground mb-4 max-w-sm" data-testid="text-empty-description">
              {(searchQuery || filtersActive)
                ? "Try adjusting the search or filters."
                : "Guests will appear here once they make reservations."}
            </p>
            {(filtersActive) && (
              <Button variant="outline" size="sm" onClick={clearAllFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGuests.map(guest => (
              <Card
                key={guest.id}
                className="hover-elevate cursor-pointer"
                onClick={() => navigate(`/guests/${guest.id}`)}
                data-testid={`card-guest-${guest.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-[#0D7377] text-white font-medium">
                        {getInitials(guest.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate" data-testid={`text-guest-name-${guest.id}`}>
                        {formatName(guest.name)}
                      </h3>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                        <Phone className="h-3.5 w-3.5" />
                        <span data-testid={`text-guest-phone-${guest.id}`}>{guest.phone}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" data-testid={`badge-visit-count-${guest.id}`}>
                        {guest.visitCount} {guest.visitCount === 1 ? "visit" : "visits"}
                      </Badge>
                      {guest.noShowCount > 0 && (
                        <Badge variant="outline" className="border-red-300 text-red-600 bg-red-50 flex items-center gap-1" data-testid={`badge-no-show-${guest.id}`}>
                          <UserX className="h-3 w-3" />{guest.noShowCount}
                        </Badge>
                      )}
                      <Button
                        size="icon" variant="ghost"
                        onClick={e => { e.stopPropagation(); deleteGuestMutation.mutate(guest.id); }}
                        disabled={deleteGuestMutation.isPending}
                        data-testid={`button-remove-guest-${guest.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t flex items-center justify-between gap-2 text-sm flex-wrap">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Last visit: {formatLastVisit(guest.lastVisit)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>Avg party: {Math.round(guest.totalPartySize / Math.max(guest.visitCount, 1))}</span>
                    </div>
                  </div>

                  {guest.depositRequired && (
                    <div className="mt-2">
                      <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                        Deposit required
                      </Badge>
                    </div>
                  )}

                  {/* Tags row: colored chips + inline picker */}
                  <div className="mt-2" onClick={e => e.stopPropagation()}>
                    {guest.tags && guest.tags.length > 0 && (
                      <GuestTagChips
                        tags={guest.tags}
                        tagOptions={tagOptionData}
                        max={3}
                        size="xs"
                        className="mb-1.5"
                      />
                    )}
                    <GuestTagPicker
                      value={guest.tags ?? []}
                      onChange={tags => updateTagsMutation.mutate({ id: guest.id, tags })}
                      tagOptions={tagOptionData}
                      placeholder={guest.tags?.length ? "Edit tags" : "Add tags"}
                      testId={`button-tag-picker-${guest.id}`}
                    />
                  </div>

                  <GuestOrderStats guestId={guest.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
