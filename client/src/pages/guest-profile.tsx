import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  ArrowLeft, MessageCircle, Edit2, Check, X, Plus,
  Phone, Loader2, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatName } from "@/lib/utils";
import type { Guest, Reservation } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  complete:  "bg-green-50 text-green-700 border-green-200",
  seated:    "bg-blue-50 text-blue-700 border-blue-200",
  confirmed: "bg-teal-50 text-teal-700 border-teal-200",
  booked:    "bg-gray-50 text-gray-700 border-gray-200",
  "no-show": "bg-red-50 text-red-600 border-red-200",
  cancelled: "bg-orange-50 text-orange-700 border-orange-200",
};

type ProfileData = { guest: Guest; reservations: Reservation[] };

export default function GuestProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal]         = useState("");
  const [newTag, setNewTag]           = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesVal, setNotesVal]         = useState("");
  const [editingDiet, setEditingDiet]   = useState(false);
  const [dietVal, setDietVal]           = useState("");

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["/api/guests", id],
  });

  const guest = data?.guest;

  const reservations = useMemo(() =>
    (data?.reservations ?? []).sort((a, b) =>
      b.date.localeCompare(a.date) || b.time.localeCompare(a.time)
    ),
    [data]
  );

  const patchMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/guests/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  // ── All derived values must be computed BEFORE any early return ──
  const groupedReservations = useMemo(() => {
    const seen = new Set<string>();
    return reservations.reduce<(Reservation & { allTables: string })[]>((acc, r) => {
      if (r.groupId) {
        if (seen.has(r.groupId)) return acc;
        seen.add(r.groupId);
        const siblings = reservations.filter(s => s.groupId === r.groupId);
        const tables = [...new Set(siblings.map(s => s.tableName))].join(", ");
        acc.push({ ...r, allTables: tables });
      } else {
        acc.push({ ...r, allTables: r.tableName });
      }
      return acc;
    }, []);
  }, [reservations]);

  const completedVisits = reservations.filter(r => r.status === "complete" || r.status === "seated").length;
  const attendedResos   = reservations.filter(r => r.status !== "cancelled" && r.status !== "no-show");
  const lifetimeCovers  = attendedResos.reduce((s, r) => s + r.partySize, 0);
  const avgParty        = attendedResos.length > 0 ? Math.round(lifetimeCovers / attendedResos.length) : 0;
  const noShowCount     = reservations.filter(r => r.status === "no-show").length;
  const cancelCount     = reservations.filter(r => r.status === "cancelled").length;
  const noShowRate      = reservations.length > 0 ? Math.round(noShowCount / reservations.length * 100) : 0;
  const cancelRate      = reservations.length > 0 ? Math.round(cancelCount / reservations.length * 100) : 0;
  const firstVisit      = reservations.length > 0 ? reservations[reservations.length - 1].date : null;
  const lastVisit       = reservations.length > 0 ? reservations[0].date : null;
  const daysSinceLast   = lastVisit ? differenceInDays(new Date(), parseISO(lastVisit)) : null;

  const waDigits      = guest?.phone.replace(/\D/g, "") ?? "";
  const hasValidPhone = waDigits.length >= 10 && !(guest?.phone ?? "").startsWith("NO_PHONE_");
  const initials      = formatName(guest?.name ?? "")
    .split(" ")
    .map(n => n[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const tags = guest?.tags ?? [];

  // ── Early returns AFTER all hooks ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!guest) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Guest not found.{" "}
        <button className="text-[#0D7377] underline" onClick={() => navigate("/guests")}>Back to list</button>
      </div>
    );
  }

  function fmtDate(d: string) {
    try { return format(parseISO(d), "EEE d MMM yyyy"); } catch { return d; }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-4xl mx-auto">

        <button
          onClick={() => navigate("/guests")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" /> Guest List
        </button>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start gap-4 mb-6">
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarFallback className="bg-[#0D7377] text-white text-xl font-medium">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  className="h-9 text-lg font-semibold"
                  data-testid="input-edit-name"
                />
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"
                  onClick={() => { patchMutation.mutate({ name: nameVal }); setEditingName(false); }}
                  data-testid="button-save-name">
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"
                  onClick={() => setEditingName(false)}
                  data-testid="button-cancel-name">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold text-foreground" data-testid="text-guest-name">
                  {formatName(guest.name)}
                </h1>
                <button
                  onClick={() => { setNameVal(guest.name); setEditingName(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-edit-name"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span data-testid="text-guest-phone">
                {guest.phone.startsWith("NO_PHONE_") ? "No phone on record" : guest.phone}
              </span>
            </div>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {guest.isWalkIn && (
                <Badge variant="secondary" className="text-xs">Walk-in</Badge>
              )}
              {guest.depositRequired && (
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50 gap-1">
                  <Shield className="h-3 w-3" /> Deposit required
                </Badge>
              )}
            </div>
          </div>

          {hasValidPhone && (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-whatsapp"
            >
              <Button variant="outline" className="gap-2 text-green-600 border-green-300 hover:bg-green-50 shrink-0">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
            </a>
          )}
        </div>

        {/* ── Stats row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          {[
            { label: "Completed", value: completedVisits },
            { label: "Covers",    value: lifetimeCovers },
            { label: "Avg party", value: avgParty || "—" },
            { label: "First visit", value: firstVisit ? format(parseISO(firstVisit), "d MMM yy") : "—" },
            { label: "Last visit",  value: lastVisit  ? format(parseISO(lastVisit),  "d MMM yy") : "—" },
            { label: "Days since",  value: daysSinceLast !== null ? daysSinceLast : "—" },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400 mb-1 leading-tight">{s.label}</p>
              <p className="text-xl font-semibold text-gray-900 leading-none">{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Risk & flags ───────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Risk &amp; Flags</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-stretch">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">No-shows</p>
              <p className="text-2xl font-semibold text-gray-900">{noShowCount}</p>
              <p className="text-xs text-gray-500">{noShowRate}% rate</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">Cancels</p>
              <p className="text-2xl font-semibold text-gray-900">{cancelCount}</p>
              <p className="text-xs text-gray-500">{cancelRate}% rate</p>
            </div>
            <div className="sm:col-span-3 flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 gap-4">
              <div>
                <p className="text-sm font-medium text-amber-800">Deposit required</p>
                <p className="text-xs text-amber-600 mt-0.5">Require deposit on future bookings</p>
              </div>
              <Switch
                checked={guest.depositRequired}
                onCheckedChange={val => patchMutation.mutate({ depositRequired: val })}
                data-testid="toggle-deposit-required"
              />
            </div>
          </div>
        </div>

        {/* ── Tags ───────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tags</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {tags.length === 0 && (
              <span className="text-xs text-gray-400 italic">No tags yet.</span>
            )}
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1 text-xs pr-1" data-testid={`badge-tag-${tag}`}>
                {tag}
                <button
                  onClick={() => patchMutation.mutate({ tags: tags.filter(t => t !== tag) })}
                  className="ml-0.5 hover:text-red-500 transition-colors"
                  data-testid={`button-remove-tag-${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add tag (VIP, press, anniversary regular…)"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              className="h-8 text-xs"
              onKeyDown={e => {
                if (e.key === "Enter" && newTag.trim()) {
                  const t = newTag.trim();
                  if (!tags.includes(t)) patchMutation.mutate({ tags: [...tags, t] });
                  setNewTag("");
                }
              }}
              data-testid="input-new-tag"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 shrink-0"
              onClick={() => {
                const t = newTag.trim();
                if (t && !tags.includes(t)) { patchMutation.mutate({ tags: [...tags, t] }); setNewTag(""); }
              }}
              data-testid="button-add-tag"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Staff Notes ────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff Notes</p>
            {!editingNotes && (
              <button
                onClick={() => { setNotesVal(guest.notes ?? ""); setEditingNotes(true); }}
                className="text-xs text-[#0D7377] hover:underline"
                data-testid="button-edit-notes"
              >
                Edit
              </button>
            )}
          </div>
          {editingNotes ? (
            <div>
              <Textarea
                value={notesVal}
                onChange={e => setNotesVal(e.target.value)}
                rows={4}
                className="resize-none text-sm mb-2"
                data-testid="textarea-notes"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-[#0D7377] text-white h-7 text-xs"
                  onClick={() => {
                    patchMutation.mutate({
                      notes: notesVal,
                      notesUpdatedAt: new Date().toISOString(),
                      notesUpdatedBy: sessionStorage.getItem("seated_staff") || "staff",
                    });
                    setEditingNotes(false);
                  }}
                  data-testid="button-save-notes"
                >
                  Save
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingNotes(false)} data-testid="button-cancel-notes">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {guest.notes?.trim() ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap" data-testid="text-notes">{guest.notes}</p>
              ) : (
                <p className="text-sm text-gray-400 italic" data-testid="text-notes">No notes yet. Click Edit to add.</p>
              )}
              {guest.notesUpdatedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Last edited {format(new Date(guest.notesUpdatedAt), "d MMM yyyy")}
                  {guest.notesUpdatedBy ? ` by ${guest.notesUpdatedBy}` : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Dietary & preferences ──────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dietary &amp; Preferences</p>
            {!editingDiet && (
              <button
                onClick={() => { setDietVal(guest.dietaryNotes ?? ""); setEditingDiet(true); }}
                className="text-xs text-[#0D7377] hover:underline"
                data-testid="button-edit-dietary"
              >
                Edit
              </button>
            )}
          </div>
          {editingDiet ? (
            <div>
              <Textarea
                value={dietVal}
                onChange={e => setDietVal(e.target.value)}
                rows={3}
                placeholder="Allergies, dietary restrictions, seating preferences…"
                className="resize-none text-sm mb-2"
                data-testid="textarea-dietary"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-[#0D7377] text-white h-7 text-xs"
                  onClick={() => { patchMutation.mutate({ dietaryNotes: dietVal }); setEditingDiet(false); }}
                  data-testid="button-save-dietary"
                >
                  Save
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingDiet(false)} data-testid="button-cancel-dietary">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {guest.dietaryNotes?.trim() ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap" data-testid="text-dietary">{guest.dietaryNotes}</p>
              ) : (
                <p className="text-sm text-gray-400 italic" data-testid="text-dietary">None recorded.</p>
              )}
            </>
          )}
        </div>

        {/* ── Visit history ──────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Visit History ({groupedReservations.length})
            </p>
          </div>

          {groupedReservations.length === 0 ? (
            <p className="text-sm text-gray-400 p-4 text-center">No reservations found.</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left font-medium px-4 py-2.5 pr-3 whitespace-nowrap">Date</th>
                      <th className="text-left font-medium py-2.5 pr-3 whitespace-nowrap">Time</th>
                      <th className="text-left font-medium py-2.5 pr-3">Pax</th>
                      <th className="text-left font-medium py-2.5 pr-3">Table(s)</th>
                      <th className="text-left font-medium py-2.5 pr-3">Status</th>
                      <th className="text-left font-medium py-2.5 pr-3 whitespace-nowrap">Name used</th>
                      <th className="text-left font-medium py-2.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedReservations.map(r => {
                      const statusClass = STATUS_COLORS[r.status] ?? STATUS_COLORS.booked;
                      const notes = r.comments?.trim() ?? "";
                      return (
                        <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 pr-3 text-gray-700 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="py-2.5 pr-3 text-gray-700 whitespace-nowrap">{r.time}</td>
                          <td className="py-2.5 pr-3 text-gray-700">{r.partySize}</td>
                          <td className="py-2.5 pr-3 text-gray-500 max-w-[140px] truncate">{r.allTables}</td>
                          <td className="py-2.5 pr-3">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusClass}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">{formatName(r.customerName)}</td>
                          <td className="py-2.5 text-gray-400 max-w-[180px]">
                            {notes
                              ? <span title={notes}>{notes.length > 40 ? notes.slice(0, 40) + "…" : notes}</span>
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile stacked */}
              <div className="sm:hidden divide-y divide-gray-50">
                {groupedReservations.map(r => {
                  const statusClass = STATUS_COLORS[r.status] ?? STATUS_COLORS.booked;
                  return (
                    <div key={r.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-gray-700">{fmtDate(r.date)} · {r.time}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusClass}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatName(r.customerName)} · {r.partySize} pax · {r.allTables}
                      </div>
                      {r.comments?.trim() && (
                        <div className="text-xs text-gray-400 truncate">{r.comments}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
