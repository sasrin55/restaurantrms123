import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Search,
  UtensilsCrossed,
  Printer,
} from "lucide-react";
import { printMenu } from "@/lib/printReceipt";

interface MenuCategoryData {
  category: string;
  items: { id: string; itemName: string }[];
}

export default function MenuManagementPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const { toast } = useToast();

  const { data: categories = [], isLoading } = useQuery<MenuCategoryData[]>({
    queryKey: ["/api/menu"],
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: { category: string; itemName: string }) => {
      const res = await apiRequest("POST", "/api/menu", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu"] });
      setNewItemName("");
      toast({ title: "Item added" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/menu/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu"] });
      toast({ title: "Item removed" });
    },
  });

  const selectedCategory = activeCategory || categories[0]?.category || "";

  const currentCategoryData = categories.find((c) => c.category === selectedCategory);

  const allFilteredItems = searchQuery.trim()
    ? categories.flatMap((cat) =>
        cat.items
          .filter((item) =>
            item.itemName.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map((item) => ({ ...item, category: cat.category }))
      )
    : [];

  const handleAddItem = () => {
    const name = newItemName.trim();
    if (!name) return;
    const cat = showNewCategory ? newCategoryName.trim() : selectedCategory;
    if (!cat) return;
    addItemMutation.mutate({ category: cat, itemName: name });
    if (showNewCategory) {
      setNewCategoryName("");
      setShowNewCategory(false);
      setActiveCategory(cat);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading menu...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b flex-wrap">
        <UtensilsCrossed className="h-5 w-5 text-muted-foreground hidden sm:block" />
        <h1 className="text-base sm:text-lg font-bold text-foreground" data-testid="text-menu-title">
          Menu
        </h1>
        <Badge variant="secondary" className="text-xs" data-testid="badge-menu-count">
          {categories.reduce((s, c) => s + c.items.length, 0)} items
        </Badge>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={() => printMenu(categories)}
          disabled={categories.length === 0}
          data-testid="button-print-menu"
        >
          <Printer className="h-3.5 w-3.5 mr-1" />
          <span className="hidden sm:inline">Print Menu</span>
          <span className="sm:hidden">Print</span>
        </Button>
        <div className="relative flex-shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 w-28 sm:w-48 text-sm"
            data-testid="input-menu-search"
          />
        </div>
      </div>

      {searchQuery.trim() ? (
        <ScrollArea className="flex-1">
          <div className="p-3 sm:p-4">
            <p className="text-sm text-muted-foreground mb-3">
              {allFilteredItems.length} result{allFilteredItems.length !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
            <div className="space-y-1.5">
              {allFilteredItems.map((item) => (
                <Card
                  key={item.id}
                  className="flex items-center justify-between px-3 py-2.5 gap-2"
                  data-testid={`card-search-item-${item.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{item.itemName}</p>
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive flex-shrink-0"
                    onClick={() => deleteItemMutation.mutate(item.id)}
                    data-testid={`button-delete-search-${item.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        </ScrollArea>
      ) : (
        <>
          <div className="border-b overflow-x-auto md:hidden">
            <div className="flex items-center gap-1 px-3 py-2 min-w-max">
              {categories.map((cat) => (
                <button
                  key={cat.category}
                  onClick={() => {
                    setActiveCategory(cat.category);
                    setShowNewCategory(false);
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                    selectedCategory === cat.category && !showNewCategory
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`button-category-${cat.category}`}
                >
                  {cat.category} ({cat.items.length})
                </button>
              ))}
              <button
                onClick={() => setShowNewCategory(true)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                  showNewCategory
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid="button-new-category"
              >
                <Plus className="h-3 w-3" />
                New
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <ScrollArea className="w-48 border-r flex-shrink-0 hidden md:block">
              <div className="p-2 space-y-0.5">
                {categories.map((cat) => (
                  <button
                    key={cat.category}
                    onClick={() => {
                      setActiveCategory(cat.category);
                      setShowNewCategory(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      selectedCategory === cat.category && !showNewCategory
                        ? "bg-sidebar-accent font-medium text-foreground"
                        : "text-muted-foreground hover-elevate"
                    }`}
                    data-testid={`button-category-desktop-${cat.category}`}
                  >
                    <span className="truncate block">{cat.category}</span>
                    <span className="text-xs text-muted-foreground">{cat.items.length} items</span>
                  </button>
                ))}
                <button
                  onClick={() => setShowNewCategory(true)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-1.5 ${
                    showNewCategory
                      ? "bg-sidebar-accent font-medium text-foreground"
                      : "text-muted-foreground hover-elevate"
                  }`}
                  data-testid="button-new-category-desktop"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Category
                </button>
              </div>
            </ScrollArea>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 sm:p-4 border-b">
                {showNewCategory ? (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Category name..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="flex-1 text-sm"
                      data-testid="input-new-category"
                    />
                  </div>
                ) : (
                  <h2 className="text-base sm:text-lg font-semibold text-foreground" data-testid="text-active-category">
                    {selectedCategory}
                  </h2>
                )}
                <div className="flex items-center gap-2 mt-2 sm:mt-3">
                  <Input
                    placeholder="Add new item..."
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                    className="flex-1 text-sm"
                    data-testid="input-new-item"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddItem}
                    disabled={!newItemName.trim() || addItemMutation.isPending || (showNewCategory && !newCategoryName.trim())}
                    data-testid="button-add-item"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-3 sm:p-4 space-y-1.5">
                  {(showNewCategory ? [] : currentCategoryData?.items || []).map((item) => (
                    <Card
                      key={item.id}
                      className="flex items-center justify-between px-3 py-2 gap-2"
                      data-testid={`card-menu-item-${item.id}`}
                    >
                      <p className="text-sm font-medium text-foreground truncate min-w-0 flex-1">
                        {item.itemName}
                      </p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive flex-shrink-0 h-7 w-7"
                        onClick={() => deleteItemMutation.mutate(item.id)}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Card>
                  ))}
                  {!showNewCategory && currentCategoryData?.items.length === 0 && (
                    <p className="text-center text-muted-foreground py-8" data-testid="text-no-items">
                      No items in this category
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
