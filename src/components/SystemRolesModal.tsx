import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SystemRoleDefinition } from '../types';
import { 
  X, 
  Plus, 
  Edit3, 
  Trash2, 
  RotateCcw, 
  ShieldCheck, 
  Check, 
  AlertCircle, 
  Users, 
  Sliders,
  CheckCircle2
} from 'lucide-react';

interface SystemRolesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEditingRoleId?: string;
}

const BADGE_COLOR_OPTIONS = [
  { label: 'Emerald (Intake & Docket)', value: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { label: 'Amber (Operations & Processing)', value: 'bg-amber-100 text-amber-800 border-amber-200' },
  { label: 'Indigo (Review & Examination)', value: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { label: 'Purple (Executive & Director Approval)', value: 'bg-purple-100 text-purple-800 border-purple-200' },
  { label: 'Blue (Custodian & Release)', value: 'bg-blue-100 text-blue-800 border-blue-200' },
  { label: 'Sky (Supervisor & Oversight)', value: 'bg-sky-100 text-sky-800 border-sky-200' },
  { label: 'Rose (System Administrator)', value: 'bg-rose-100 text-rose-800 border-rose-200' },
  { label: 'Slate (Staff & General Personnel)', value: 'bg-slate-100 text-slate-800 border-slate-200' },
  { label: 'Teal (Specialized Unit)', value: 'bg-teal-100 text-teal-800 border-teal-200' },
  { label: 'Orange (Audit & Compliance)', value: 'bg-orange-100 text-orange-800 border-orange-200' },
];

export const SystemRolesModal: React.FC<SystemRolesModalProps> = ({ 
  isOpen, 
  onClose,
  initialEditingRoleId 
}) => {
  const { 
    systemRoles, 
    updateSystemRole, 
    addSystemRole, 
    deleteSystemRole, 
    resetSystemRoles,
    users,
    workflowTemplates,
    documents
  } = useApp();

  const [isEditingFormOpen, setIsEditingFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<SystemRoleDefinition | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<SystemRoleDefinition>({
    id: '',
    name: '',
    code: '',
    description: '',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    canIntake: false,
    canProcess: false,
    canReview: false,
    canApprove: false,
    canRelease: false,
    canSupervise: false,
    canAdmin: false,
    isSystemDefault: false,
  });

  // Initialize only when the modal target changes. Database polling replaces the
  // systemRoles array, and must never overwrite a form that is being edited.
  React.useEffect(() => {
    if (isOpen && initialEditingRoleId) {
      const target = systemRoles.find(r => r.id === initialEditingRoleId);
      if (target) {
        handleOpenEdit(target);
      }
    }
  }, [isOpen, initialEditingRoleId]);

  // If a refresh reveals that the same role is stored under a different key,
  // reconcile only its identity fields and preserve the user's unsaved edits.
  React.useEffect(() => {
    if (!isOpen || !isEditingFormOpen || !editingRole) return;
    const current = systemRoles.find(role => role.id === editingRole.id)
      || systemRoles.find(role => role.code && editingRole.code && role.code.toLowerCase() === editingRole.code.toLowerCase())
      || systemRoles.find(role => role.name.toLowerCase() === editingRole.name.toLowerCase());
    if (!current || current.id === editingRole.id) return;
    setEditingRole(previous => previous ? { ...previous, id: current.id } : null);
    setFormData(previous => ({ ...previous, id: current.id }));
  }, [isOpen, isEditingFormOpen, editingRole, systemRoles]);

  if (!isOpen) return null;

  const handleOpenAdd = () => {
    setEditingRole(null);
    setFormData({
      id: '',
      name: '',
      code: '',
      description: '',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      canIntake: false,
      canProcess: true,
      canReview: false,
      canApprove: false,
      canRelease: false,
      canSupervise: false,
      canAdmin: false,
      isSystemDefault: false,
    });
    setIsEditingFormOpen(true);
  };

  const handleOpenEdit = (role: SystemRoleDefinition) => {
    setEditingRole(role);
    setFormData({ ...role });
    setIsEditingFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitted = new FormData(e.currentTarget as HTMLFormElement);
    const nextFormData: SystemRoleDefinition = {
      ...formData,
      id: String(submitted.get('id') || formData.id).trim(),
      name: String(submitted.get('name') || '').trim(),
      code: String(submitted.get('code') || formData.id).toUpperCase().trim(),
      description: String(submitted.get('description') || '').trim(),
      badgeClass: String(submitted.get('badgeClass') || formData.badgeClass),
      canIntake: submitted.has('canIntake'),
      canProcess: submitted.has('canProcess'),
      canReview: submitted.has('canReview'),
      canApprove: submitted.has('canApprove'),
      canRelease: submitted.has('canRelease'),
      canSupervise: submitted.has('canSupervise'),
      canAdmin: submitted.has('canAdmin'),
    };
    if (!nextFormData.name) return;

    if (editingRole) {
      const saved = await updateSystemRole({
        ...nextFormData,
      }, {
        id: editingRole.id,
        code: editingRole.code,
        name: editingRole.name,
      });
      if (!saved) return;
    } else {
      const generatedId = (formData.id.trim() || nextFormData.name.toLowerCase().replace(/[^a-z0-9]/g, '_')).toLowerCase();
      if (!(await addSystemRole({
        ...nextFormData,
        id: generatedId,
        code: nextFormData.code || generatedId.toUpperCase(),
        isSystemDefault: false,
      }))) return;
    }

    setEditingRole(null);
    setIsEditingFormOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                System Base Roles & Permissions
                <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                  {systemRoles.length} Roles
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Configure role titles, action authority, and permission scopes used across workflows and personnel desks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-3 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Role</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action bar */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-slate-600 font-medium">
            Click <span className="font-semibold text-slate-800">Edit</span> on any role to rename, adjust clearance permissions, or customize badge styles.
          </span>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('Restore missing default roles? Existing roles and custom permissions will be preserved.')) {
                if (!(await resetSystemRoles())) return;
              }
            }}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 hover:underline cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restore Missing Defaults</span>
          </button>
        </div>

        {/* Content list */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {systemRoles.map(role => {
              const assignedCount = users.filter(u => u.role === role.id).length;
              const workflowCount = workflowTemplates.filter(workflow =>
                workflow.steps.some(step => step.assigneeRole === role.id)
              ).length;
              const documentCount = documents.filter(document =>
                document.workflowSteps.some(step => step.assignedTo.role === role.id)
              ).length;
              const isProtected = role.id === 'admin' || Boolean(role.canAdmin);

              return (
                <div 
                  key={role.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${role.badgeClass || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {role.code || role.id}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                          {role.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(role)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit this role"
                        aria-label="Edit Role"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        
                        {!isProtected && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(role.id)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete role"
                            aria-label="Delete Role"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 mb-2 font-mono flex items-center gap-1">
                      <span>id:</span>
                      <span className="bg-slate-100 px-1.5 py-0.2 rounded text-slate-700">{role.id}</span>
                      {role.isSystemDefault && (
                        <span className="text-[10px] text-slate-400 italic">(Default Core Role)</span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">
                      {role.description || 'No description provided.'}
                    </p>

                    {/* Permissions tags */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {role.canIntake && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          Docket / Intake
                        </span>
                      )}
                      {role.canProcess && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                          Process
                        </span>
                      )}
                      {role.canReview && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                          Review
                        </span>
                      )}
                      {role.canApprove && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded">
                          Approve & Sign
                        </span>
                      )}
                      {role.canRelease && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                          Release / Archive
                        </span>
                      )}
                      {role.canSupervise && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded">
                          Supervise
                        </span>
                      )}
                      {role.canAdmin && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded">
                          Admin
                        </span>
                      )}
                      {!role.canIntake && !role.canProcess && !role.canReview && !role.canApprove && !role.canRelease && !role.canSupervise && !role.canAdmin && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                          General Access
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{assignedCount} personnel</span>
                    </span>
                  </div>

                  {/* Inline Delete Confirmation */}
                  {confirmDeleteId === role.id && (
                    <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg animate-in fade-in text-xs">
                      <p className="font-semibold text-rose-800">Delete role &quot;{role.name}&quot;?</p>
                      {(assignedCount > 0 || workflowCount > 0 || documentCount > 0) ? (
                        <p className="my-2 text-rose-700">
                          Reassign {assignedCount} personnel, {workflowCount} workflow(s), and {documentCount} document route(s) before deleting this role.
                        </p>
                      ) : (
                        <p className="my-2 text-rose-700">Its role designations will also be removed. This cannot be undone.</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={assignedCount > 0 || workflowCount > 0 || documentCount > 0}
                          onClick={async () => {
                            if (!(await deleteSystemRole(role.id))) return;
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-rose-600 text-white rounded hover:bg-rose-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 text-xs font-semibold bg-white text-slate-600 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Changes apply immediately across all workflow phases and personnel desks.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Edit / Add Role Sub-Modal */}
        {isEditingFormOpen && (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95">
              <form onSubmit={handleSave}>
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {editingRole ? `Edit Role: ${editingRole.name}` : 'Add New System Role'}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Customize role display name, capabilities, and system authority.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingFormOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
                  {/* Role Title */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Role Display Name *
                    </label>
                    <input
                      aria-label="Role display name"
                      name="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Processor / Operations Staff"
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Role Code */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Role Code (Short) *
                      </label>
                      <input
                        aria-label="Role code"
                        name="code"
                        type="text"
                        required
                        maxLength={8}
                        value={formData.code}
                        onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        placeholder="e.g. PROC, RO, REV"
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono font-bold"
                      />
                    </div>

                    {/* Role System ID */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        System Key / Identifier
                      </label>
                      <input
                        aria-label="System key"
                        name="id"
                        type="text"
                        disabled={!!editingRole && (editingRole.isSystemDefault || editingRole.id === 'admin')}
                        value={formData.id}
                        onChange={e => setFormData({ ...formData, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                        placeholder="e.g. processor"
                        className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Badge Style */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Badge Color Style
                    </label>
                    <select
                      value={formData.badgeClass}
                      name="badgeClass"
                      onChange={e => setFormData({ ...formData, badgeClass: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                    >
                      {BADGE_COLOR_OPTIONS.map(b => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Role Description & Functional Scope
                    </label>
                    <textarea
                      aria-label="Role description"
                      name="description"
                      rows={2}
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Summary of responsibilities and document processing duties..."
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                    />
                  </div>

                  {/* System Permissions / Capabilities Checkboxes */}
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-2">
                      Authority & Action Permissions
                    </label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100/70 cursor-pointer">
                        <input
                          type="checkbox"
                          name="canIntake"
                          checked={formData.canIntake}
                          onChange={e => setFormData({ ...formData, canIntake: e.target.checked })}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-slate-800 block">Intake & Docket</span>
                          <span className="text-[10px] text-slate-500">Register new documents & generate tracking numbers</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100/70 cursor-pointer">
                        <input
                          type="checkbox"
                          name="canProcess"
                          checked={formData.canProcess}
                          onChange={e => setFormData({ ...formData, canProcess: e.target.checked })}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-slate-800 block">Process & Calculate</span>
                          <span className="text-[10px] text-slate-500">Execute workflow processing phases & claim tasks</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100/70 cursor-pointer">
                        <input
                          type="checkbox"
                          name="canReview"
                          checked={formData.canReview}
                          onChange={e => setFormData({ ...formData, canReview: e.target.checked })}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-slate-800 block">Review & Endorse</span>
                          <span className="text-[10px] text-slate-500">Compliance examination and division endorsements</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100/70 cursor-pointer">
                        <input
                          type="checkbox"
                          name="canApprove"
                          checked={formData.canApprove}
                          onChange={e => setFormData({ ...formData, canApprove: e.target.checked })}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-slate-800 block">Approve & Sign</span>
                          <span className="text-[10px] text-slate-500">Official executive signature and clearance</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100/70 cursor-pointer">
                        <input
                          type="checkbox"
                          name="canRelease"
                          checked={formData.canRelease}
                          onChange={e => setFormData({ ...formData, canRelease: e.target.checked })}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-slate-800 block">Release & Archive</span>
                          <span className="text-[10px] text-slate-500">Outward dispatch and official archive custody</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100/70 cursor-pointer">
                        <input
                          type="checkbox"
                          name="canSupervise"
                          checked={formData.canSupervise}
                          onChange={e => setFormData({ ...formData, canSupervise: e.target.checked })}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-slate-800 block">Supervise & Route</span>
                          <span className="text-[10px] text-slate-500">Reassign tasks and manage bottlenecks</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100/70 cursor-pointer sm:col-span-2">
                        <input
                          type="checkbox"
                          name="canAdmin"
                          checked={formData.canAdmin}
                          onChange={e => setFormData({ ...formData, canAdmin: e.target.checked })}
                          className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-rose-800 block">System Administrator Privileges</span>
                          <span className="text-[10px] text-slate-500">Governance, workflow templates, catalogue management, and access controls</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingFormOpen(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="btn-save-system-role"
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{editingRole ? 'Save Changes' : 'Create Role'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
