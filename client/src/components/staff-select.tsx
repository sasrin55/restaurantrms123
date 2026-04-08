import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StaffMember {
  id: number;
  name: string;
}

interface StaffSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
}

export function StaffSelect({ value, onChange, placeholder = "Select staff member", testId }: StaffSelectProps) {
  const [manageOpen, setManageOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const { toast } = useToast();

  const { data: staff = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
  });

  const addMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/staff", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setNewName("");
    },
    onError: () => toast({ title: "Name already exists", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/staff/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
    },
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    addMutation.mutate(newName.trim());
  }

  return (
    <>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="flex-1" data-testid={testId}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {staff.map(m => (
              <SelectItem key={m.id} value={m.name} data-testid={`option-staff-${m.id}`}>
                {m.name}
              </SelectItem>
            ))}
            {staff.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No staff members</div>
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setManageOpen(true)}
          title="Manage staff"
          data-testid="btn-manage-staff"
          className="shrink-0"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Clear selection helper */}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs text-muted-foreground hover:text-foreground mt-1"
        >
          Clear
        </button>
      )}

      {/* Manage Staff Dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage Staff</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Add new */}
            <form onSubmit={handleAdd} className="flex gap-2">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Staff member name"
                data-testid="input-new-staff"
              />
              <Button
                type="submit"
                size="icon"
                disabled={addMutation.isPending || !newName.trim()}
                className="bg-[#0D7377] text-white hover:bg-[#0a5f63] shrink-0"
                data-testid="btn-add-staff"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </form>

            {/* List */}
            <div className="divide-y rounded-lg border max-h-52 overflow-y-auto">
              {staff.map(m => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium">{m.name}</span>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(m.id)}
                    disabled={deleteMutation.isPending}
                    className="text-muted-foreground hover:text-rose-500 transition-colors"
                    data-testid={`btn-delete-staff-${m.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {staff.length === 0 && (
                <div className="px-3 py-4 text-xs text-center text-muted-foreground">No staff members added yet</div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
