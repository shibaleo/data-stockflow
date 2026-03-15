"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

export interface ComboOption {
  value: string;
  label: string;
  /** Optional shorter label shown on the trigger button (defaults to label) */
  displayLabel?: string;
}

interface Props {
  options: ComboOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  /** Called when user wants to create a new item. Returns the new item's value (id) or null on failure. */
  onCreate?: (name: string) => Promise<string | null>;
  /** Called when user renames an existing selected item. */
  onRename?: (value: string, newName: string) => Promise<boolean>;
}

export function MasterCombobox({
  options,
  value,
  onValueChange,
  placeholder = "選択...",
  emptyText = "見つかりません",
  className,
  onCreate,
  onRename,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  // Focus the edit input when entering edit mode
  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editing]);

  const handleCreate = useCallback(async () => {
    if (!onCreate || !search.trim()) return;
    const newId = await onCreate(search.trim());
    if (newId) {
      onValueChange(newId);
      setSearch("");
      setOpen(false);
    }
  }, [onCreate, search, onValueChange]);

  const handleRenameSubmit = useCallback(async () => {
    if (!onRename || !value || !editText.trim()) {
      setEditing(false);
      return;
    }
    const currentLabel = selected?.displayLabel ?? selected?.label ?? "";
    if (editText.trim() === currentLabel) {
      setEditing(false);
      return;
    }
    const ok = await onRename(value, editText.trim());
    if (ok) {
      // parent will refresh options
    }
    setEditing(false);
  }, [onRename, value, editText, selected]);

  const startEditing = () => {
    if (!onRename || !selected) return;
    setEditText(selected.displayLabel ?? selected.label);
    setEditing(true);
  };

  // Editable trigger: when selected + onRename available, double-click to edit
  if (editing) {
    return (
      <input
        ref={editRef}
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={handleRenameSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleRenameSubmit();
          }
          if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        className={cn(
          "flex h-7 w-full items-center bg-transparent px-2 text-xs outline-none ring-1 ring-primary/50 rounded-sm",
          className
        )}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          onDoubleClick={onRename ? startEditing : undefined}
          className={cn(
            "flex h-7 w-full items-center justify-between bg-transparent px-2 text-xs outline-none focus:bg-accent/30",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selected ? (selected.displayLabel ?? selected.label) : placeholder}
          </span>
          <ChevronsUpDown className="ml-1 size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder={placeholder}
            className="h-8 text-xs"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty className="py-2 text-xs text-center">
              {onCreate && search.trim() ? (
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-1 w-full px-2 py-1 text-xs hover:bg-accent rounded-sm text-primary"
                >
                  <Plus className="size-3" />
                  「{search.trim()}」を新規作成
                </button>
              ) : (
                emptyText
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onValueChange(o.value === value ? "" : o.value);
                    setSearch("");
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "mr-1 size-3",
                      value === o.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && search.trim() && options.length > 0 && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${search}`}
                  onSelect={handleCreate}
                  className="text-xs text-primary"
                >
                  <Plus className="mr-1 size-3" />
                  「{search.trim()}」を新規作成
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
