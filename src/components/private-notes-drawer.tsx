import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listNotes, createNote, updateNote, deleteNote } from "@/lib/notes.functions";
import { Pin, Trash2, Plus, CreditCard as Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";

interface PrivateNotesDrawerProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}

export function PrivateNotesDrawer({ open, onClose, conversationId }: PrivateNotesDrawerProps) {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotes);
  const createFn = useServerFn(createNote);
  const updateFn = useServerFn(updateNote);
  const deleteFn = useServerFn(deleteNote);

  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const notes = useQuery({
    queryKey: ["notes", conversationId],
    queryFn: () => listFn({ data: { conversationId } }),
    enabled: open,
  });

  async function add() {
    const text = draft.trim();
    if (!text) return;
    try {
      await createFn({ data: { conversationId, content: text } });
      setDraft("");
      qc.invalidateQueries({ queryKey: ["notes", conversationId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add note");
    }
  }

  async function save(id: string) {
    try {
      await updateFn({ data: { id, content: editText } });
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["notes", conversationId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save note");
    }
  }

  async function togglePin(id: string, pinned: boolean) {
    const note = notes.data?.find((n) => n.id === id);
    if (!note) return;
    try {
      await updateFn({ data: { id, content: note.content, pinned: !pinned } });
      qc.invalidateQueries({ queryKey: ["notes", conversationId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function del(id: string) {
    try {
      await deleteFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["notes", conversationId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-xs flex-col gap-4 bg-card">
        <SheetHeader>
          <SheetTitle className="font-display text-lg">Private Notes</SheetTitle>
          <p className="text-xs text-muted-foreground">Only you can see these. Never shared.</p>
        </SheetHeader>

        {/* Add note */}
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a private note…"
            rows={2}
            maxLength={2000}
            className="resize-none text-sm"
          />
          <Button size="sm" disabled={!draft.trim()} onClick={add} className="self-end gap-1.5">
            <Plus className="size-3.5" /> Add Note
          </Button>
        </div>

        {/* Notes list */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {notes.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {notes.data?.map((n) => (
            <div
              key={n.id}
              className={cn(
                "group relative rounded-xl border border-border bg-muted/40 p-3 text-sm",
                n.pinned && "ring-1 ring-amber-400/40",
              )}
            >
              {n.pinned && (
                <Pin className="absolute right-2 top-2 size-3 rotate-45 text-amber-400" />
              )}
              {editId === n.id ? (
                <div className="space-y-2">
                  <Textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => save(n.id)}>
                      <Check className="size-3" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setEditId(null)}
                    >
                      <X className="size-3" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words pr-4">{n.content}</p>
              )}
              {editId !== n.id && (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground/60">
                    {formatRelative(n.created_at)}
                  </span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setEditId(n.id);
                        setEditText(n.content);
                      }}
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Edit2 className="size-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => togglePin(n.id, n.pinned)}
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Pin
                        className={cn(
                          "size-3 rotate-45",
                          n.pinned ? "text-amber-400" : "text-muted-foreground",
                        )}
                      />
                    </button>
                    <button
                      onClick={() => del(n.id)}
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Trash2 className="size-3 text-destructive" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!notes.isLoading && notes.data?.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">No notes yet. Add one above.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
