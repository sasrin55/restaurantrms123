import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, AlertTriangle, Smartphone, Clock } from "lucide-react";

interface PhoneStatus {
  id: number;
  label: string;
  connected: boolean;
  number?: string | null;
  qr: string | null;
}

// "923205792162" → "0320 5792162" (local Pakistani format).
function fmtNumber(n?: string | null): string {
  if (!n) return "";
  const local = n.startsWith("92") ? "0" + n.slice(2) : n;
  return local.length > 4 ? `${local.slice(0, 4)} ${local.slice(4)}` : local;
}

interface WaMessage {
  id: number;
  customer_name: string;
  customer_phone: string;
  message: string;
  status: string;
  error: string | null;
  sent_via: string | null;
  created_at: string;
}

const FAIL_STATUSES = new Set(["failed", "wa_disconnected", "error"]);

function fmtTime(ts: string): string {
  // SQLite stores UTC "YYYY-MM-DD HH:MM:SS"; show local-ish time.
  const d = new Date(ts.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function WhatsappLogPage() {
  const [selected, setSelected] = useState<WaMessage | null>(null);
  const statusQuery = useQuery<{ configured: boolean; phones: PhoneStatus[]; error?: string }>({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: 5000, // snappy while staff are actively scanning a QR
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const msgQuery = useQuery<{ configured: boolean; messages: WaMessage[]; error?: string }>({
    queryKey: ["/api/whatsapp/messages"],
    refetchInterval: 20000,
    staleTime: 0,
  });

  const phones = statusQuery.data?.phones ?? [];
  const messages = msgQuery.data?.messages ?? [];
  const configured = statusQuery.data?.configured ?? msgQuery.data?.configured ?? true;
  const failedCount = messages.filter((m) => FAIL_STATUSES.has(m.status)).length;
  const connectedCount = phones.filter((p) => p.connected).length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-6">
        <div className="border-b pb-4">
          <h1 className="text-lg sm:text-2xl font-semibold text-foreground">WhatsApp</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Connection health, re-link QR codes, and a log of every message — including what failed and why.
          </p>
        </div>

        {!configured ? (
          <Card className="p-5 text-sm text-muted-foreground">
            WhatsApp isn't connected to this restaurant yet.
          </Card>
        ) : (
          <>
            {/* Connection / phones */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Smartphone className="h-4 w-4" /> Phones
                </h2>
                <span className="text-xs text-muted-foreground">{connectedCount}/{phones.length || 2} connected</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {phones.map((p) => (
                  <Card key={p.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground capitalize">{p.label}</span>
                        {p.number && <span className="text-xs text-muted-foreground">{fmtNumber(p.number)}</span>}
                      </div>
                      {p.connected ? (
                        <Badge className="bg-green-600 text-white gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Connected</Badge>
                      ) : (
                        <Badge className="bg-rose-500 text-white gap-1"><XCircle className="h-3.5 w-3.5" />Disconnected</Badge>
                      )}
                    </div>
                    {!p.connected && (
                      <div className="mt-3 flex flex-col items-center gap-2">
                        {p.qr ? (
                          <>
                            <div className="rounded-xl border p-3 bg-white">
                              <QRCodeCanvas value={p.qr} size={180} level="M" />
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                              Scan with this phone's WhatsApp → Linked Devices → Link a Device. The code refreshes automatically.
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground py-4">Reconnecting… (QR appears here if it needs re-scanning)</p>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
                {phones.length === 0 && (
                  <Card className="p-4 text-sm text-muted-foreground">
                    {statusQuery.isLoading ? "Checking phones…" : statusQuery.data?.error || "WhatsApp service unreachable."}
                  </Card>
                )}
              </div>
            </div>

            {/* Message log */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Message log <span className="font-normal text-muted-foreground">· tap a row to read the full message</span>
                </h2>
                {failedCount > 0 && (
                  <span className="text-xs font-medium text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> {failedCount} failed (last {messages.length})
                  </span>
                )}
              </div>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Time</th>
                        <th className="text-left px-3 py-2 font-semibold">Guest</th>
                        <th className="text-left px-3 py-2 font-semibold">Phone</th>
                        <th className="text-left px-3 py-2 font-semibold">Message</th>
                        <th className="text-left px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {messages.map((m) => {
                        const failed = FAIL_STATUSES.has(m.status);
                        return (
                          <tr
                            key={m.id}
                            onClick={() => setSelected(m)}
                            className={`cursor-pointer transition-colors ${failed ? "bg-rose-50 hover:bg-rose-100" : "hover:bg-muted/50"}`}
                          >
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs flex items-center gap-1">
                              <Clock className="h-3 w-3" />{fmtTime(m.created_at)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap font-medium text-foreground">{m.customer_name || "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{m.customer_phone}</td>
                            <td className="px-3 py-2 max-w-xs truncate text-muted-foreground">{m.message}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {failed ? (
                                <span className="text-rose-600 text-xs font-medium" title={m.error || ""}>
                                  ✕ {m.status === "wa_disconnected" ? "No phone connected" : (m.error ? shortErr(m.error) : "Failed")}
                                </span>
                              ) : m.status === "sent" ? (
                                <span className="text-green-600 text-xs font-medium">✓ Sent{m.sent_via ? ` · ${m.sent_via}` : ""}</span>
                              ) : (
                                <span className="text-amber-600 text-xs font-medium">{m.status}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {messages.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">
                          {msgQuery.isLoading ? "Loading…" : "No messages yet."}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      {/* Full-message viewer */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Message to {selected?.customer_name || selected?.customer_phone || "guest"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-muted-foreground">Phone</span>
                  <div className="font-medium text-foreground">{selected.customer_phone || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Sent</span>
                  <div className="font-medium text-foreground">{fmtTime(selected.created_at)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <div className="font-medium">
                    {FAIL_STATUSES.has(selected.status) ? (
                      <span className="text-rose-600">✕ {selected.status === "wa_disconnected" ? "No phone connected" : (selected.error ? shortErr(selected.error) : "Failed")}</span>
                    ) : selected.status === "sent" ? (
                      <span className="text-green-600">✓ Sent</span>
                    ) : (
                      <span className="text-amber-600">{selected.status}</span>
                    )}
                  </div>
                </div>
                {selected.sent_via && (
                  <div>
                    <span className="text-muted-foreground">Sent via</span>
                    <div className="font-medium text-foreground">{selected.sent_via}</div>
                  </div>
                )}
              </div>
              {selected.error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 break-words">
                  {selected.error}
                </div>
              )}
              <div>
                <span className="text-xs text-muted-foreground">Message</span>
                <div className="mt-1 rounded-lg border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap break-words">
                  {selected.message}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Trim noisy puppeteer/WhatsApp errors to a short readable reason.
function shortErr(err: string): string {
  if (/No LID for user/i.test(err)) return "Number not on WhatsApp";
  if (/Execution context was destroyed/i.test(err)) return "Page reloaded — retry";
  if (/timed out|protocolTimeout/i.test(err)) return "Timed out — retry";
  if (/disconnected|All phones/i.test(err)) return "No phone connected";
  return err.length > 40 ? err.slice(0, 40) + "…" : err;
}
