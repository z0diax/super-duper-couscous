import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AssigneeDesignation, UserRole } from '../types';
import { 
  X, 
  Plus, 
  Edit3, 
  Trash2, 
  RotateCcw, 
  Users, 
  UserCheck, 
  Building2, 
  ShieldCheck, 
  Search,
  Check,
  AlertCircle,
  Sliders
} from 'lucide-react';
import { SystemRolesModal } from './SystemRolesModal';

interface AssigneeDesignationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AssigneeDesignationsModal: React.FC<AssigneeDesignationsModalProps> = ({ isOpen, onClose }) => {
  const { 
    assigneeDesignations, 
    addAssigneeDesignation, 
    updateAssigneeDesignation, 
    deleteAssigneeDesignation, 
    resetAssigneeDesignations,
    systemRoles 
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<'all' | 'Role' | 'Team'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // State for System Roles Modal
  const [isSystemRolesModalOpen, setIsSystemRolesModalOpen] = useState(false);
  const [selectedRoleIdForModal, setSelectedRoleIdForModal] = useState<string | undefined>(undefined);

  // State for Add / Edit Modal Form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AssigneeDesignation | null>(null);
  
  const [formData, setFormData] = useState<{
    category: 'Role' | 'Team';
    title: string;
    baseRole: UserRole;
    description: string;
  }>({
    category: 'Role',
    title: '',
    baseRole: 'processor',
    description: '',
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleOpenAdd = (category: 'Role' | 'Team' = 'Role') => {
    setEditingItem(null);
    setFormData({
      category,
      title: '',
      baseRole: category === 'Role' ? 'processor' : 'employee',
      description: '',
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: AssigneeDesignation) => {
    setEditingItem(item);
    setFormData({
      category: item.category,
      title: item.title,
      baseRole: item.baseRole || 'processor',
      description: item.description || '',
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    if (editingItem) {
      if (!(await updateAssigneeDesignation({
        ...editingItem,
        category: formData.category,
        title: formData.title.trim(),
        baseRole: formData.category === 'Role' ? formData.baseRole : undefined,
        description: formData.description.trim(),
      }))) return;
    } else {
      if (!(await addAssigneeDesignation({
        category: formData.category,
        title: formData.title.trim(),
        baseRole: formData.category === 'Role' ? formData.baseRole : undefined,
        description: formData.description.trim(),
      }))) return;
    }

    setIsFormOpen(false);
    setEditingItem(null);
  };

  const filteredItems = assigneeDesignations.filter(item => {
    if (activeFilter !== 'all' && item.category !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.baseRole && item.baseRole.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const rolesCount = assigneeDesignations.filter(d => d.category === 'Role').length;
  const teamsCount = assigneeDesignations.filter(d => d.category === 'Team').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-inner">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Assignee Types & Designations</h2>
              <p className="text-xs text-slate-300">
                Manage government roles, department officer titles, and division teams available in workflows
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action & Filter Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-200/80 p-1 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  activeFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({assigneeDesignations.length})
              </button>
              <button
                onClick={() => setActiveFilter('Role')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                  activeFilter === 'Role'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Roles ({rolesCount})
              </button>
              <button
                onClick={() => setActiveFilter('Team')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                  activeFilter === 'Team'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Divisions & Teams ({teamsCount})
              </button>
            </div>

            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search designations or teams..."
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedRoleIdForModal(undefined);
                setIsSystemRolesModalOpen(true);
              }}
              title="Edit or create system base roles and access permissions"
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 bg-white border border-slate-300 hover:border-blue-300 rounded-lg hover:bg-blue-50/50 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>System Base Roles ({systemRoles.length})</span>
            </button>

            <button
              onClick={resetAssigneeDesignations}
              title="Restore missing default designations; preserve existing configuration"
              className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Restore Missing Defaults</span>
            </button>

            <button
              onClick={() => handleOpenAdd('Role')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Designation</span>
            </button>
          </div>
        </div>

        {/* Content List Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">No designations or teams found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your search query or add a new one.</p>
              <button
                onClick={() => handleOpenAdd('Role')}
                className="mt-3 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add New Designation
              </button>
            </div>
          ) : (
            filteredItems.map(item => {
              const isRole = item.category === 'Role';
              const isConfirmingDelete = confirmDeleteId === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isRole ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    }`}>
                      {isRole ? <UserCheck className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          isRole ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isRole ? 'Role' : 'Team'}
                        </span>
                        {item.baseRole && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRoleIdForModal(item.baseRole);
                              setIsSystemRolesModalOpen(true);
                            }}
                            className="text-[11px] bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 px-2 py-0.5 rounded font-mono flex items-center gap-1 transition-colors cursor-pointer"
                            title="Click to view or edit this system role"
                          >
                            <span>Base: {systemRoles.find(r => r.id === item.baseRole)?.name || item.baseRole}</span>
                            <Edit3 className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        )}
                        {item.isCustom && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                            Custom
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 p-1 rounded-lg">
                        <span className="text-[11px] font-medium text-rose-700 px-1">Delete?</span>
                        <button
                          onClick={async () => {
                            if (!(await deleteAssigneeDesignation(item.id))) return;
                            setConfirmDeleteId(null);
                          }}
                          className="p-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1 text-xs text-slate-600 hover:bg-slate-200 rounded transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit this designation"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete this designation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>
            Changes made here take effect immediately in all workflow phases and document routing templates.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Done
          </button>
        </div>

        {/* Submodal: Add / Edit Designation Form */}
        {isFormOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                    {editingItem ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </div>
                  <h3 className="text-sm font-bold">
                    {editingItem ? 'Edit Assignee Designation' : 'Add New Assignee Designation / Team'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category Type *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, category: 'Role' })}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        formData.category === 'Role'
                          ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <UserCheck className="w-4 h-4" />
                      Department Role
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, category: 'Team' })}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        formData.category === 'Team'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      Division / Team
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {formData.category === 'Role' ? 'Role Title / Designation Name *' : 'Division / Team Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder={
                      formData.category === 'Role'
                        ? 'e.g. Legal Counsel / Ethics Officer'
                        : 'e.g. Internal Audit Service'
                    }
                    className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {formData.category === 'Role' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">
                        System Base Role Mapping *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRoleIdForModal(formData.baseRole);
                          setIsSystemRolesModalOpen(true);
                        }}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                        title="Edit name, code, or permissions of this base role"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit This Role</span>
                      </button>
                    </div>

                    <select
                      value={formData.baseRole}
                      onChange={e => {
                        if (e.target.value === '__EDIT_ROLES__') {
                          setSelectedRoleIdForModal(formData.baseRole);
                          setIsSystemRolesModalOpen(true);
                          return;
                        }
                        setFormData({ ...formData, baseRole: e.target.value as UserRole });
                      }}
                      className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer font-medium"
                    >
                      {systemRoles.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name} ({opt.id})
                        </option>
                      ))}
                      <option value="__EDIT_ROLES__">+ Edit, Rename, or Add System Roles...</option>
                    </select>

                    {/* Active base role summary card */}
                    {(() => {
                      const activeRoleDef = systemRoles.find(r => r.id === formData.baseRole);
                      if (!activeRoleDef) return null;

                      return (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${activeRoleDef.badgeClass || 'bg-slate-100 text-slate-700'}`}>
                                {activeRoleDef.code || activeRoleDef.id}
                              </span>
                              <span className="font-semibold text-slate-800 text-xs">
                                {activeRoleDef.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRoleIdForModal(activeRoleDef.id);
                                setIsSystemRolesModalOpen(true);
                              }}
                              className="text-[11px] text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center gap-0.5 cursor-pointer"
                            >
                              <Sliders className="w-3 h-3" />
                              Configure
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {activeRoleDef.description}
                          </p>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {activeRoleDef.canIntake && (
                              <span className="text-[9px] font-semibold px-1 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                                Intake
                              </span>
                            )}
                            {activeRoleDef.canProcess && (
                              <span className="text-[9px] font-semibold px-1 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                                Process
                              </span>
                            )}
                            {activeRoleDef.canReview && (
                              <span className="text-[9px] font-semibold px-1 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                                Review
                              </span>
                            )}
                            {activeRoleDef.canApprove && (
                              <span className="text-[9px] font-semibold px-1 py-0.2 bg-purple-50 text-purple-700 border border-purple-200 rounded">
                                Approve
                              </span>
                            )}
                            {activeRoleDef.canRelease && (
                              <span className="text-[9px] font-semibold px-1 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                                Release
                              </span>
                            )}
                            {activeRoleDef.canSupervise && (
                              <span className="text-[9px] font-semibold px-1 py-0.2 bg-sky-50 text-sky-700 border border-sky-200 rounded">
                                Supervise
                              </span>
                            )}
                            {activeRoleDef.canAdmin && (
                              <span className="text-[9px] font-semibold px-1 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 rounded">
                                Admin
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description / Office Function (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief summary of duties, approval scope, or jurisdictional responsibility..."
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {editingItem ? 'Save Changes' : 'Create Designation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* System Roles Modal */}
        <SystemRolesModal
          isOpen={isSystemRolesModalOpen}
          onClose={() => {
            setIsSystemRolesModalOpen(false);
            setSelectedRoleIdForModal(undefined);
          }}
          initialEditingRoleId={selectedRoleIdForModal}
        />
      </div>
    </div>
  );
};
