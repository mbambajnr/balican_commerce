"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Tag, Pencil, X, Check, Folder, FolderOpen, CaretDown, CaretRight, ToggleLeft, ToggleRight } from "@phosphor-icons/react";
import { TableSkeleton } from "@/components/admin/LoadingSkeleton";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [editIsActive, setEditIsActive] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminGetCategoryTree();
      setCategories(res.categories);
    } catch { toast.error("Failed to load categories"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api.adminCreateCategory({ name: newName, description: newDesc || undefined, parentId: newParentId || undefined });
      toast.success("Category created");
      setNewName(""); setNewDesc(""); setNewParentId(""); setShowForm(false);
      if (newParentId) toggleExpand(newParentId);
      load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDesc(c.description || "");
    setEditParentId(c.parent_category_id || "");
    setEditSortOrder(c.sort_order ?? 0);
    setEditIsActive(c.is_active !== false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDesc("");
    setEditParentId("");
    setEditSortOrder(0);
    setEditIsActive(true);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await api.adminUpdateCategory(id, {
        name: editName,
        description: editDesc || undefined,
        parentId: editParentId || null,
        sortOrder: editSortOrder,
        isActive: editIsActive,
      });
      toast.success("Category updated");
      cancelEdit();
      load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const flattenForParentSelect = (cats: any[], depth = 0): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const c of cats) {
      result.push({ id: c.id, name: c.name, depth });
      if (c.children?.length) result.push(...flattenForParentSelect(c.children, depth + 1));
    }
    return result;
  };

  const renderCategoryRow = (cat: any, depth = 0) => {
    const hasChildren = cat.children?.length > 0;
    const isExpanded = expanded.has(cat.id);
    const isEditing = editingId === cat.id;

    if (isEditing) {
      const flat = flattenForParentSelect(categories);
      return (
        <tr key={cat.id} className="border-b border-border/50 text-sm hover:bg-zinc-50/50">
          <td className="px-6 py-3" style={{ paddingLeft: `${16 + depth * 24}px` }}>
            <div className="flex items-center gap-2">
              <Folder size={16} className="text-accent shrink-0" />
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input text-sm flex-1" />
            </div>
          </td>
          <td className="px-6 py-3">
            <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="input text-sm w-full" placeholder="Description" />
          </td>
          <td className="px-6 py-3">
            <input type="number" min={0} value={editSortOrder} onChange={(e) => setEditSortOrder(Number(e.target.value))} className="input text-sm w-16" />
          </td>
          <td className="px-6 py-3">
            <select value={editParentId} onChange={(e) => setEditParentId(e.target.value)} className="input text-sm">
              <option value="">Top-level</option>
              {flat.filter((f) => f.id !== cat.id).map((f) => (
                <option key={f.id} value={f.id}>{'\u00A0'.repeat(f.depth * 2)}{f.name}</option>
              ))}
            </select>
          </td>
          <td className="px-6 py-3">
            <button onClick={() => setEditIsActive(!editIsActive)} className="text-lg">
              {editIsActive ? <ToggleRight size={20} className="text-green-600" /> : <ToggleLeft size={20} className="text-muted" />}
            </button>
          </td>
          <td className="px-6 py-3">
            <div className="flex gap-2">
              <button onClick={() => handleUpdate(cat.id)} className="btn btn-sm btn-primary gap-1"><Check size={14} /> Save</button>
              <button onClick={cancelEdit} className="btn btn-sm gap-1"><X size={14} /> Cancel</button>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr key={cat.id} className="border-b border-border/50 text-sm hover:bg-zinc-50/50">
        <td className="px-6 py-3" style={{ paddingLeft: `${16 + depth * 24}px` }}>
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <button onClick={() => toggleExpand(cat.id)} className="text-muted hover:text-ink">
                {isExpanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
              </button>
            ) : <span className="w-3.5" />}
            <Folder size={16} className="text-accent shrink-0" />
            <span className={`font-medium ${!cat.is_active ? "text-muted line-through" : ""}`}>{cat.name}</span>
            {!cat.is_active && <span className="badge badge-gray text-xs">inactive</span>}
          </div>
        </td>
        <td className="px-6 py-3 text-muted max-w-xs truncate">{cat.description || "\u2014"}</td>
        <td className="px-6 py-3 text-muted font-mono text-xs">{cat.slug}</td>
        <td className="px-6 py-3 text-muted">{cat.sort_order ?? 0}</td>
        <td className="px-6 py-3 text-muted">{cat.product_count || 0}</td>
        <td className="px-6 py-3">
          <button onClick={() => startEdit(cat)} className="btn btn-sm gap-1"><Pencil size={14} /> Edit</button>
        </td>
      </tr>
    );
  };

  const renderCategoryRows = (cats: any[], depth = 0): React.ReactNode => {
    return cats.map((cat: any) => (
      <>
        {renderCategoryRow(cat, depth)}
        {cat.children?.length > 0 && expanded.has(cat.id) && renderCategoryRows(cat.children, depth + 1)}
      </>
    ));
  };

  const flatOptions = flattenForParentSelect(categories);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Categories</h1>
          <p className="mt-1 text-sm text-soft">Organize products in a parent/child hierarchy</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary gap-2">
          {showForm ? <X size={16} /> : <Plus size={16} weight="bold" />}
          {showForm ? "Cancel" : "Add Category"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mt-6 p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="input-label">Name *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input" placeholder="Category name" required />
            </div>
            <div>
              <label className="input-label">Description</label>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="input" placeholder="Optional" />
            </div>
            <div>
              <label className="input-label">Parent Category</label>
              <select value={newParentId} onChange={(e) => setNewParentId(e.target.value)} className="input">
                <option value="">Top-level category</option>
                {flatOptions.map((f) => (
                  <option key={f.id} value={f.id}>{'\u00A0'.repeat(f.depth * 2)}{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Create Category</button>
        </form>
      )}

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : (
        <div className="card mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Slug</th>
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3">Products</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-muted">No categories yet</td></tr>
                ) : renderCategoryRows(categories)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
