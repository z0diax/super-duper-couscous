import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Tags, 
  Plus, 
  Clock, 
  Check, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Building, 
  Layers, 
  FileText,
  Trash2
} from 'lucide-react';

export const ClassificationCatalogue: React.FC = () => {
  const { 
    classifications, 
    toggleClassificationType, 
    addClassificationType, updateClassificationType, deleteClassificationType, workflowTemplates,
    can
  } = useApp();

  const [activeCategory, setActiveCategory] = useState<string>(classifications[0]?.id || 'cat-comm');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDescription, setNewTypeDescription] = useState('');
  const [newTypeSla, setNewTypeSla] = useState(48);
  const [deleteConfirmTypeId, setDeleteConfirmTypeId] = useState<string | null>(null);

  const selectedCategory = classifications.find(c => c.id === activeCategory) || classifications[0];

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;

    const saveType = editingTypeId ? updateClassificationType : addClassificationType;
    if (!(await saveType(selectedCategory.id, {
      ...(editingTypeId ? { id: editingTypeId } : {}),
      name: newTypeName,
      description: newTypeDescription,
      defaultSlaHours: Number(newTypeSla),
    }))) return;

    setIsAddModalOpen(false); setEditingTypeId(null);
    setNewTypeName('');
    setNewTypeDescription('');
    setNewTypeSla(48);
  };

  const isAdmin = can('canAdmin');

  const handleDeleteType = async (typeId: string) => {
    if (!(await deleteClassificationType(selectedCategory.id, typeId))) return;
    setDeleteConfirmTypeId(null);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Tags className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Records setup</p>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Document Types</h1>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">
                Manage the document types used when registering and routing records.
              </p>
            </div>
          </div>

          <button
            id="btn-add-classification-type"
            onClick={() => { setEditingTypeId(null); setNewTypeName(''); setNewTypeDescription(''); setNewTypeSla(48); setIsAddModalOpen(true); }}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Document Type</span>
          </button>
        </div>

        {/* Category Selector Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 pt-4 border-t border-slate-100">
          {classifications.map(cat => {
            const isSelected = cat.id === selectedCategory.id;
            return (
              <button
                key={cat.id}
                id={`cat-tab-${cat.id}`}
                onClick={() => setActiveCategory(cat.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/90 border-blue-400 ring-1 ring-blue-400'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs sm:text-sm text-slate-900">
                    {cat.classification}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {cat.types.length}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">
                  {cat.types.filter(t => t.isActive).length} active
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Types List */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {selectedCategory.classification} Document Types
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedCategory.description}
            </p>
          </div>
          <span className="text-xs text-slate-500">
            <strong className="text-slate-800">{selectedCategory.types.length}</strong> {selectedCategory.types.length === 1 ? 'type' : 'types'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {selectedCategory.types.map(t => (
            <div
              key={t.id}
              className={`p-4 rounded-xl border transition-all ${
                t.isActive
                  ? 'bg-white border-slate-200 hover:border-blue-300 shadow-2xs'
                  : 'bg-slate-50/80 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-slate-900">
                      {t.name}
                    </h4>
                    {workflowTemplates.some(w => w.isActive && w.classification === selectedCategory.classification && (w.documentTypes?.length ? w.documentTypes : [w.documentType]).some(type => type.toLowerCase() === t.name.toLowerCase())) && (
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-semibold px-2 py-0.2 rounded border border-blue-200">
                        Custom workflow
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {t.description}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button className="text-xs text-blue-700" onClick={() => { setEditingTypeId(t.id); setNewTypeName(t.name); setNewTypeDescription(t.description); setNewTypeSla(t.defaultSlaHours); setIsAddModalOpen(true); }}>Edit</button>
                  {isAdmin && (deleteConfirmTypeId === t.id ? (
                    <span className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 p-1">
                      <span className="px-1 text-[10px] font-bold text-rose-700">Delete?</span>
                      <button type="button" onClick={() => handleDeleteType(t.id)} className="rounded bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700">Confirm</button>
                      <button type="button" onClick={() => setDeleteConfirmTypeId(null)} className="rounded px-1.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-200">Cancel</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Delete ${t.name}`}
                      title="Delete document type"
                      onClick={() => setDeleteConfirmTypeId(t.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  ))}
                  <button
                    id={`btn-toggle-type-${t.id}`}
                    onClick={async () => await toggleClassificationType(selectedCategory.id, t.id)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      t.isActive
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {t.isActive ? 'Active' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Document Type Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in-50">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {editingTypeId ? 'Edit Document Type in' : 'Add Document Type to'} {selectedCategory.classification}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Document Type Name *
                </label>
                <input
                  id="input-new-type-name"
                  type="text"
                  required
                  value={newTypeName}
                  onChange={e => setNewTypeName(e.target.value)}
                  placeholder="e.g. Subsidy Claim, Inter-office Memorandum"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Description / Operational Scope
                </label>
                <textarea
                  id="input-new-type-desc"
                  rows={2}
                  value={newTypeDescription}
                  onChange={e => setNewTypeDescription(e.target.value)}
                  placeholder="Explain transaction purpose and criteria..."
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <label className="block font-semibold text-slate-700">Default SLA hours
                <input aria-label="Default SLA hours" type="number" min={1} max={8760} required value={newTypeSla} onChange={e => setNewTypeSla(Number(e.target.value))} className="mt-1 w-full p-2 border rounded-lg" />
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-confirm-add-type"
                  className="px-4 py-1.5 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                >
                  {editingTypeId ? 'Save Document Type' : 'Register Document Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
