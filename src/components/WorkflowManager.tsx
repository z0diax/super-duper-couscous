import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WorkflowTemplate, WorkflowStepTemplate, DocumentClassification, UserRole } from '../types';
import { 
  GitMerge, 
  Layers, 
  Plus, 
  Edit3, 
  Save, 
  RotateCcw,
  Paperclip,
  Trash2,
  Copy,
  Check,
  X,
  FileText,
  Search,
  ArrowUp,
  ArrowDown,
  Tag,
  AlertTriangle,
  Sparkles,
  UserCheck,
  Sliders,
  Users
} from 'lucide-react';
import { AssigneeDesignationsModal } from './AssigneeDesignationsModal';
import { OFFICE_OPTIONS } from '../data/offices';

const TEAM_OPTIONS = [
  'Records & Document Management Unit',
  'Compensation & Benefits Division',
  'Personnel Administration & Welfare',
  'Executive Directorate',
  'Office of the City Mayor',
  'City Accounting Department',
  'Budget Administration Unit',
];

const REQUIRED_ACTIONS: WorkflowStepTemplate['requiredAction'][] = [
  'Receive',
  'Verify & Process',
  'Review & Recommend',
  'Approve & Sign',
  'Release & Archive',
];

const stageTypeOf = (step: WorkflowStepTemplate) => step.stageType || (step.requiredAction === 'Release & Archive' ? 'FINAL_RELEASE' : 'INTERNAL_PROCESSING');

const ExternalStageFields: React.FC<{
  step: WorkflowStepTemplate;
  onChange: (field: keyof WorkflowStepTemplate, value: any) => void;
  designations: Array<{ id: string; title: string; category: string; baseRole?: UserRole }>;
  users: Array<{ id: string; name: string; roleTitle: string }>;
  onManage: () => void;
}> = ({ step, onChange, designations, users, onManage }) => (
  <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
    <div className="mb-3 flex items-center justify-between gap-2">
      <div>
        <p className="text-xs font-bold text-amber-950">External Handoff / Review</p>
        <p className="text-[11px] text-amber-800">The destination is a custodian, not a system user. The workflow pauses until HRMDO records its return.</p>
      </div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block text-[11px] font-semibold text-slate-700">External Purpose
        <select value={step.externalPurpose || 'Approval'} onChange={e => onChange('externalPurpose', e.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white p-2 text-xs">
          {['Approval','Comments','Signature','Review','Recommendation','Certification','Other'].map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="block text-[11px] font-semibold text-slate-700">Destination Mode
        <select value={step.externalDestinationMode || 'SELECT_AT_HANDOFF'} onChange={e => onChange('externalDestinationMode', e.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white p-2 text-xs">
          <option value="SELECT_AT_HANDOFF">Select at Handoff</option><option value="FIXED_DESTINATION">Fixed Destination</option>
        </select>
      </label>
      {(step.externalDestinationMode || 'SELECT_AT_HANDOFF') === 'FIXED_DESTINATION' ? (
        <label className="block text-[11px] font-semibold text-slate-700 sm:col-span-2">External Destination Office
          <select value={step.externalDestinationOffice || ''} onChange={e => onChange('externalDestinationOffice', e.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white p-2 text-xs">
            <option value="">Select an office</option>
            {OFFICE_OPTIONS.map(office => <option key={office} value={office}>{office}</option>)}
          </select>
        </label>
      ) : (
        <p className="sm:col-span-2 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-[11px] text-amber-900">The handoff officer will choose the destination office from the office catalogue when the document reaches this phase.</p>
      )}
      <label className="block text-[11px] font-semibold text-slate-700">Return Receiving Desk / Personnel
        <select value={step.returnReceiverName || ''} onChange={e => {
          const value=e.target.value; const role=designations.find(d=>d.category==='Role' && d.title===value); const team=designations.find(d=>d.category==='Team' && d.title===value);
          if (role) { onChange('returnReceiverType','Role'); onChange('returnReceiverRole',role.baseRole); onChange('returnReceiverName',role.title); }
          else if (team) { onChange('returnReceiverType','Team'); onChange('returnReceiverTeam',team.title); onChange('returnReceiverName',team.title); }
          else if (value==='__MANAGE__') onManage();
        }} className="mt-1 w-full rounded-lg border border-amber-200 bg-white p-2 text-xs">
          <option value="">Select a receiving desk</option><optgroup label="Roles">{designations.filter(d=>d.category==='Role').map(d=><option key={d.id} value={d.title}>{d.title}</option>)}</optgroup><optgroup label="Teams">{designations.filter(d=>d.category==='Team').map(d=><option key={d.id} value={d.title}>{d.title}</option>)}</optgroup><option value="__MANAGE__">Manage designations…</option>
        </select>
      </label>
      <label className="block text-[11px] font-semibold text-slate-700">Specific Return Receiver (optional)
        <select value={step.returnReceiverUserId || ''} onChange={e=>{ const user=users.find(item=>item.id===e.target.value); if (user) { onChange('returnReceiverType','Person'); onChange('returnReceiverUserId',user.id); onChange('returnReceiverName',user.name); } }} className="mt-1 w-full rounded-lg border border-amber-200 bg-white p-2 text-xs">
          <option value="">Use selected desk or team</option>{users.map(user=><option key={user.id} value={user.id}>{user.name} — {user.roleTitle}</option>)}
        </select>
      </label>
      <label className="block text-[11px] font-semibold text-slate-700">Expected Turnaround (hours)
        <input type="number" min={1} max={8760} value={step.expectedTurnaroundHours || ''} onChange={e=>onChange('expectedTurnaroundHours',e.target.value ? Number(e.target.value) : undefined)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white p-2 text-xs" />
      </label>
      <div className="flex flex-wrap items-center gap-4 pt-5 text-xs text-slate-700">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!step.requiresReturnedAttachment} onChange={e=>onChange('requiresReturnedAttachment',e.target.checked)} />Require returned attachment</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!step.requiresExternalResult} onChange={e=>onChange('requiresExternalResult',e.target.checked)} />Require external result</label>
      </div>
    </div>
  </div>
);

export const WorkflowManager: React.FC = () => {
  const { 
    workflowTemplates, 
    updateWorkflowTemplate, 
    createWorkflowTemplate, 
    deleteWorkflowTemplate, 
    classifications, 
    currentUser, users, systemRoles,
    assigneeDesignations 
  } = useApp();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(workflowTemplates[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClassification, setFilterClassification] = useState<string>('ALL');
  const [isDesignationsModalOpen, setIsDesignationsModalOpen] = useState(false);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<WorkflowTemplate | null>(null);

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newClassification, setNewClassification] = useState<DocumentClassification>('Communication');
  const [newDocTypeSelection, setNewDocTypeSelection] = useState<string[]>(['Office Order']);
  const [newEmploymentClassification, setNewEmploymentClassification] = useState<'All' | 'Job Order (JOW)' | 'Regular' | 'Casual'>('All');
  const [newCustomDocType, setNewCustomDocType] = useState('');
  const [newSteps, setNewSteps] = useState<WorkflowStepTemplate[]>([
    {
      stepNumber: 1,
      name: 'Document Intake & Initial Docketing',
      description: 'Log transmittal, check requirements, verify signatures, and encode into tracking.',
      assigneeType: 'Role',
      assigneeRole: 'receiving_officer',
      assigneeName: 'Receiving & Docketing Officer',
      slaHours: 24,
      requiredAction: 'Receive',
      allowHold: false,
      allowReturn: false,
      requiresAttachment: true,
    },
    {
      stepNumber: 2,
      name: 'Department Review & Final Disposition',
      description: 'Substantive assessment, evaluation of request, and signing of official order or endorsement.',
      assigneeType: 'Role',
      assigneeRole: 'approver',
      assigneeName: 'HRMDO Director / Approving Authority',
      slaHours: 48,
      requiredAction: 'Approve & Sign',
      allowHold: false,
      allowReturn: true,
      requiresAttachment: false,
    },
  ]);

  // Delete confirmation modal state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Active selected template (guarded)
  const activeTemplate = workflowTemplates.find(wf => wf.id === selectedTemplateId) || workflowTemplates[0];

  // Helper: Catalog types for a given classification
  const getCatalogTypes = (cls: DocumentClassification) => {
    const cat = classifications.find(c => c.classification === cls);
    return cat?.types.map(t => t.name) || [];
  };

  const workflowTypes = (workflow: WorkflowTemplate) => workflow.documentTypes?.length ? workflow.documentTypes : [workflow.documentType];
  const availableRoleDesignations = assigneeDesignations.filter(designation =>
    designation.category === 'Role' && systemRoles.some(role => role.id === designation.baseRole)
  );

  const invalidStepAssignment = (steps: WorkflowStepTemplate[]) => steps.find(step =>
    stageTypeOf(step) !== 'EXTERNAL_HANDOFF_REVIEW' && ((step.assigneeType === 'Role' && !systemRoles.some(role => role.id === step.assigneeRole)) ||
    (step.assigneeType === 'Person' && !users.some(user => user.id === step.assigneeUserId))
    )
  );

  // Filtered templates list
  const filteredTemplates = workflowTemplates.filter(wf => {
    const matchesClass = filterClassification === 'ALL' || wf.classification === filterClassification;
    const matchesSearch = 
      wf.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workflowTypes(wf).some(type => type.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (wf.employmentClassification && wf.employmentClassification.toLowerCase().includes(searchQuery.toLowerCase())) ||
      wf.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesClass && matchesSearch;
  });

  const handleSelectTemplate = (id: string) => {
    if (isEditing) {
      if (!window.confirm('You have unsaved changes. Discard and switch template?')) {
        return;
      }
      setIsEditing(false);
      setEditFormData(null);
    }
    setSelectedTemplateId(id);
  };

  const startEditing = () => {
    if (!activeTemplate) return;
    setEditFormData({ ...JSON.parse(JSON.stringify(activeTemplate)), documentTypes: workflowTypes(activeTemplate) });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditFormData(null);
  };

  const saveEditing = async () => {
    if (!editFormData) return;
    if (!editFormData.title.trim() || !(editFormData.documentTypes?.length || editFormData.documentType.trim())) {
      alert('Please provide a valid Title and Document Type for this workflow.');
      return;
    }
    if (editFormData.steps.length === 0) {
      alert('A workflow must contain at least one phase.');
      return;
    }
    const invalidAssignment = invalidStepAssignment(editFormData.steps);
    if (invalidAssignment) {
      alert(`Choose an existing role or officer for Phase ${invalidAssignment.stepNumber}. Its previous assignee no longer exists.`);
      return;
    }

    // Renumber steps cleanly
    const sanitizedSteps = editFormData.steps.map((st, i) => ({
      ...st,
      stepNumber: i + 1,
    }));

    if (!(await updateWorkflowTemplate({
      ...editFormData,
      employmentClassification: editFormData.classification === 'Payroll' ? (editFormData.employmentClassification || 'All') : undefined,
      steps: sanitizedSteps,
    }))) return;

    setIsEditing(false);
    setEditFormData(null);
  };

  // Step manipulation in Edit Mode
  const handleEditStepChange = (index: number, field: keyof WorkflowStepTemplate, value: any) => {
    if (!editFormData) return;
    setEditFormData(previous => previous ? { ...previous, steps: previous.steps.map((step, i) => i === index ? { ...step, [field]: value } : step) } : null);
  };

  const handleEditStageTypeChange = (index: number, stageType: NonNullable<WorkflowStepTemplate['stageType']>) => {
    if (!editFormData) return;
    setEditFormData(previous => previous ? { ...previous, steps: previous.steps.map((step, i) => i === index ? {
      ...step, stageType, requiredAction: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? 'External Handoff' : stageType === 'FINAL_RELEASE' ? 'Release & Archive' : step.requiredAction === 'External Handoff' || step.requiredAction === 'Release & Archive' ? 'Verify & Process' : step.requiredAction,
      assigneeType: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? 'System' : step.assigneeType === 'System' ? 'Role' : step.assigneeType,
      assigneeRole: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? undefined : step.assigneeRole || 'processor',
      assigneeName: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? 'System / awaiting HRMDO handoff' : step.assigneeName || 'Processor',
      externalPurpose: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.externalPurpose || 'Approval' : undefined,
      externalDestinationMode: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.externalDestinationMode || 'SELECT_AT_HANDOFF' : undefined,
      returnReceiverType: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.returnReceiverType || 'Role' : undefined,
      returnReceiverRole: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.returnReceiverRole || 'receiving_officer' : undefined,
      returnReceiverName: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.returnReceiverName || 'Receiving Officer' : undefined,
    } : step) } : null);
  };

  const handleAddEditStep = () => {
    if (!editFormData) return;
    const nextStepNum = editFormData.steps.length + 1;
    const fallbackRole = systemRoles.find(role => role.id === 'reviewer') || systemRoles.find(role => role.id !== 'admin') || systemRoles[0];
    if (!fallbackRole) return;
    const newStep: WorkflowStepTemplate = {
      stepNumber: nextStepNum,
      name: `Phase ${nextStepNum} Review`,
      description: 'Action required for this processing phase.',
      assigneeType: 'Role',
      assigneeRole: fallbackRole.id as UserRole,
      assigneeName: fallbackRole.name,
      slaHours: 24,
      requiredAction: 'Verify & Process',
      allowHold: false,
      allowReturn: true,
      requiresAttachment: false,
    };
    setEditFormData({
      ...editFormData,
      steps: [...editFormData.steps, newStep],
    });
  };

  const handleRemoveEditStep = (index: number) => {
    if (!editFormData) return;
    if (editFormData.steps.length <= 1) {
      alert('A workflow template must have at least one phase.');
      return;
    }
    const filtered = editFormData.steps.filter((_, i) => i !== index);
    const renumbered = filtered.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    setEditFormData({ ...editFormData, steps: renumbered });
  };

  const handleMoveEditStep = (index: number, direction: 'up' | 'down') => {
    if (!editFormData) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= editFormData.steps.length) return;

    const updatedSteps = [...editFormData.steps];
    const [moved] = updatedSteps.splice(index, 1);
    updatedSteps.splice(targetIndex, 0, moved);
    const renumbered = updatedSteps.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    setEditFormData({ ...editFormData, steps: renumbered });
  };

  // Clone Template
  const handleCloneTemplate = (source: WorkflowTemplate) => {
    setNewTitle(`${source.title} (Copy)`);
    setNewDescription(`Custom routing variation based on ${source.title}`);
    setNewClassification(source.classification);
    setNewDocTypeSelection(workflowTypes(source));
    setNewEmploymentClassification(source.employmentClassification || 'All');
    setNewCustomDocType('');
    setNewSteps(JSON.parse(JSON.stringify(source.steps)));
    setIsCreateModalOpen(true);
  };

  // Create Template submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const customDocType = newCustomDocType.trim();
    const finalDocTypes = [...(customDocType ? newDocTypeSelection.filter(type => type !== 'All') : newDocTypeSelection), ...(customDocType ? [customDocType] : [])];
    const finalDocType = finalDocTypes[0];

    if (!newTitle.trim() || !finalDocType) {
      alert('Please provide a template title and specify the target document type.');
      return;
    }

    if (newSteps.length === 0) {
      alert('Please configure at least one phase for this workflow template.');
      return;
    }
    const invalidAssignment = invalidStepAssignment(newSteps);
    if (invalidAssignment) {
      alert(`Choose an existing role or officer for Phase ${invalidAssignment.stepNumber}. Its previous assignee no longer exists.`);
      return;
    }

    const created = await createWorkflowTemplate({
      title: newTitle.trim(),
      description: newDescription.trim() || `Workflow pipeline for ${newClassification} - ${finalDocType}`,
      classification: newClassification,
      documentType: finalDocType,
      documentTypes: finalDocTypes,
      employmentClassification: newClassification === 'Payroll' ? newEmploymentClassification : undefined,
      isActive: true,
      steps: newSteps.map((s, i) => ({ ...s, stepNumber: i + 1 })),
    });
    if (!created) return;

    setIsCreateModalOpen(false);
    setSelectedTemplateId(created.id);
  };

  // Step manipulation in Create Modal
  const handleCreateStepChange = (index: number, field: keyof WorkflowStepTemplate, value: any) => {
    setNewSteps(previous => previous.map((step, i) => i === index ? { ...step, [field]: value } : step));
  };

  const handleCreateStageTypeChange = (index: number, stageType: NonNullable<WorkflowStepTemplate['stageType']>) => {
    setNewSteps(previous => previous.map((step, i) => i === index ? {
      ...step, stageType, requiredAction: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? 'External Handoff' : stageType === 'FINAL_RELEASE' ? 'Release & Archive' : step.requiredAction === 'External Handoff' || step.requiredAction === 'Release & Archive' ? 'Verify & Process' : step.requiredAction,
      assigneeType: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? 'System' : step.assigneeType === 'System' ? 'Role' : step.assigneeType,
      assigneeRole: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? undefined : step.assigneeRole || 'processor',
      assigneeName: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? 'System / awaiting HRMDO handoff' : step.assigneeName || 'Processor',
      externalPurpose: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.externalPurpose || 'Approval' : undefined,
      externalDestinationMode: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.externalDestinationMode || 'SELECT_AT_HANDOFF' : undefined,
      returnReceiverType: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.returnReceiverType || 'Role' : undefined,
      returnReceiverRole: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.returnReceiverRole || 'receiving_officer' : undefined,
      returnReceiverName: stageType === 'EXTERNAL_HANDOFF_REVIEW' ? step.returnReceiverName || 'Receiving Officer' : undefined,
    } : step));
  };

  const handleAddCreateStep = () => {
    const nextNum = newSteps.length + 1;
    const fallbackRole = systemRoles.find(role => role.id === 'reviewer') || systemRoles.find(role => role.id !== 'admin') || systemRoles[0];
    if (!fallbackRole) return;
    const added: WorkflowStepTemplate = {
      stepNumber: nextNum,
      name: `Phase ${nextNum} Processing`,
      description: 'Enter action details for this workflow phase.',
      assigneeType: 'Role',
      assigneeRole: fallbackRole.id as UserRole,
      assigneeName: fallbackRole.name,
      slaHours: 24,
      requiredAction: 'Verify & Process',
      allowHold: false,
      allowReturn: true,
      requiresAttachment: false,
    };
    setNewSteps([...newSteps, added]);
  };

  const handleRemoveCreateStep = (index: number) => {
    if (newSteps.length <= 1) {
      alert('A workflow must have at least one phase.');
      return;
    }
    const filtered = newSteps.filter((_, i) => i !== index);
    setNewSteps(filtered.map((s, i) => ({ ...s, stepNumber: i + 1 })));
  };

  const handleMoveCreateStep = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newSteps.length) return;
    const updated = [...newSteps];
    const [moved] = updated.splice(index, 1);
    updated.splice(target, 0, moved);
    setNewSteps(updated.map((s, i) => ({ ...s, stepNumber: i + 1 })));
  };

  // Delete Handler
  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    const success = await deleteWorkflowTemplate(deleteTargetId);
    if (!success) return;
    if (success) {
      const remaining = workflowTemplates.filter(w => w.id !== deleteTargetId);
      if (remaining.length > 0) {
        setSelectedTemplateId(remaining[0].id);
      }
    }
    setDeleteTargetId(null);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
                <GitMerge className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Configurable Workflow Engine
              </h1>
              <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2.5 py-0.5 rounded-full border border-blue-200">
                Document-Bound Pipelines
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-3xl">
              Create, edit, and assign custom multi-phase approval workflows directly to specific document classifications and document types.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsDesignationsModalOpen(true)}
              className="px-3.5 py-2.5 text-xs sm:text-sm font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Sliders className="w-4 h-4 text-slate-500" />
              <span>Assignee Designations & Teams</span>
            </button>

            <button
              id="btn-create-workflow-template"
              onClick={() => {
                setNewTitle('');
                setNewDescription('');
                setNewClassification('Communication');
                setNewDocTypeSelection(['Office Order']);
                setNewCustomDocType('');
                const fallbackRole = systemRoles.find(role => role.id !== 'admin') || systemRoles[0];
                if (fallbackRole) setNewSteps(previous => previous.map(step => systemRoles.some(role => role.id === step.assigneeRole) ? step : { ...step, assigneeType: 'Role', assigneeRole: fallbackRole.id as UserRole, assigneeName: fallbackRole.name }));
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2.5 text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Workflow</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Directory + Inspector/Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Template List (5 Cols) */}
        <div className="lg:col-span-4 xl:col-span-4 space-y-3">
          
          {/* Search & Classification Filters */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search templates or document types..."
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
              {['ALL', 'Communication', 'Payroll', 'Request', 'Others'].map(cls => (
                <button
                  key={cls}
                  onClick={() => setFilterClassification(cls)}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    filterClassification === cls
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Workflow Templates ({filteredTemplates.length})
            </span>
          </div>

          {/* Cards List */}
          <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
            {filteredTemplates.map(wf => {
              const isSelected = wf.id === activeTemplate?.id;
              return (
                <div
                  key={wf.id}
                  id={`wf-card-${wf.id}`}
                  onClick={() => handleSelectTemplate(wf.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-400/20 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">
                      {wf.title}
                    </h3>
                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                      v{wf.version}.0
                    </span>
                  </div>

                  {/* Document Binding Pill */}
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-100/70 text-blue-800 px-2 py-0.5 rounded-md border border-blue-200">
                      <Tag className="w-2.5 h-2.5 shrink-0" />
                      <span>
                        {wf.classification} &rsaquo; {workflowTypes(wf).join(', ')}
                        {wf.employmentClassification && wf.employmentClassification !== 'All' ? ` (${wf.employmentClassification})` : ''}
                      </span>
                    </span>
                    {!wf.isActive && (
                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        Inactive
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 mb-2.5">
                    {wf.description}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                    <span className="font-medium text-slate-600 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-slate-400" />
                      <span>{wf.steps.length} ordered phases</span>
                    </span>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        title="Clone template"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloneTemplate(wf);
                        }}
                        className="p-1 hover:text-blue-600 hover:bg-white rounded transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Delete template"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetId(wf.id);
                        }}
                        className="p-1 hover:text-rose-600 hover:bg-white rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredTemplates.length === 0 && (
              <div className="bg-white p-8 rounded-xl border border-dashed border-slate-200 text-center text-slate-500 text-xs">
                No workflow templates found matching your filter.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Template Inspector / Editor (8 Cols) */}
        <div className="lg:col-span-8 xl:col-span-8 space-y-4">
          
          {/* Active Template Card */}
          {activeTemplate && !isEditing && (
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-6 animate-in fade-in-50">
              
              {/* Header & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      {activeTemplate.classification} Workflow
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      Version {activeTemplate.version}.0
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      activeTemplate.isActive 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {activeTemplate.isActive ? 'Active Pipeline' : 'Inactive'}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    {activeTemplate.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    {activeTemplate.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    id="btn-clone-active-template"
                    onClick={() => handleCloneTemplate(activeTemplate)}
                    className="px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Clone</span>
                  </button>
                  <button
                    id="btn-edit-active-template"
                    onClick={startEditing}
                    className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Workflow & Phases</span>
                  </button>
                  <button
                    id="btn-delete-active-template"
                    onClick={() => setDeleteTargetId(activeTemplate.id)}
                    className="px-3 py-2 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Document Assignment Banner */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900">
                      Assigned Target Document
                    </span>
                    <div className="text-sm font-bold text-slate-900 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>Classification: <strong className="text-blue-700 font-semibold">{activeTemplate.classification}</strong></span>
                      <span className="text-slate-400">&bull;</span>
                      <span>Target Document Types: <strong className="text-blue-700 font-semibold">{workflowTypes(activeTemplate).join(', ')}</strong></span>
                      {activeTemplate.employmentClassification && activeTemplate.employmentClassification !== 'All' && (
                        <>
                          <span className="text-slate-400">&bull;</span>
                          <span>Employment: <strong className="text-blue-700 font-semibold">{activeTemplate.employmentClassification}</strong></span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Incoming documents registered with this classification and type automatically invoke this sequential workflow.
                    </p>
                  </div>
                </div>

                <span className="text-xs font-bold text-blue-800 bg-white px-3 py-1.5 rounded-lg border border-blue-200 shrink-0 self-start sm:self-auto">
                  {activeTemplate.steps.length} Phases
                </span>
              </div>

              {/* Steps Pipeline Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Sequential Processing Phases
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Auto-routing & audit trails execute sequentially
                  </span>
                </div>

                <div className="space-y-3">
                  {activeTemplate.steps.map((step, idx) => (
                    <div
                      key={step.stepNumber}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors relative"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {step.stepNumber}
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-slate-900">
                                {step.name}
                              </h4>
                              <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                                {stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? 'External Handoff / Review' : stageTypeOf(step) === 'FINAL_RELEASE' ? 'Final Release' : `Action: ${step.requiredAction}`}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed">
                              {step.description}
                            </p>

                            <div className="flex items-center gap-3 pt-1 text-xs text-slate-600 flex-wrap">
                              {stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? <span className="font-medium text-amber-800">Destination: <strong className="text-slate-900">{step.externalDestinationMode === 'SELECT_AT_HANDOFF' ? 'Selected at handoff' : step.externalDestinationOffice}</strong> • Return desk: <strong className="text-slate-900">{step.returnReceiverName}</strong></span> : <span className="flex items-center gap-1 font-medium"><UserCheck className="w-3.5 h-3.5 text-blue-600" /><span>Person in Charge: <strong className="text-slate-900">{step.assigneeName}</strong></span></span>}
                              {step.allowReturn && (
                                <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium text-[11px] border border-amber-200">
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Return Allowed</span>
                                </span>
                              )}
                              {step.requiresAttachment && (
                                <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium text-[11px] border border-blue-200">
                                  <Paperclip className="w-3 h-3" />
                                  <span>Attachment Required</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <span className="text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shrink-0">
                          Phase {idx + 1}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* EDIT MODE FORM */}
          {isEditing && editFormData && (
            <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-blue-400 shadow-md space-y-6 animate-in fade-in-50">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <Edit3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Editing Workflow: {editFormData.title}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Configure target document binding, phase sequence, and assigned processing queues.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditing}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>

              {/* Section 1: Template Metadata & Document Binding */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  1. Template Details & Document Assignment
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Workflow Template Title *
                    </label>
                    <input
                      type="text"
                      value={editFormData.title}
                      onChange={e => setEditFormData({ ...editFormData, title: e.target.value })}
                      required
                      placeholder="e.g. Standard Office Order Routing Workflow"
                      className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Description / Operational Purpose
                    </label>
                    <textarea
                      rows={2}
                      value={editFormData.description}
                      onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                      placeholder="Explain the document approval pipeline..."
                      className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Document Classification *
                    </label>
                    <select
                      value={editFormData.classification}
                      onChange={e => {
                        const newCls = e.target.value as DocumentClassification;
                        const catalog = getCatalogTypes(newCls);
                        setEditFormData({
                          ...editFormData,
                          classification: newCls,
                          documentType: catalog[0] || editFormData.documentType,
                          documentTypes: catalog[0] ? [catalog[0]] : workflowTypes(editFormData),
                          employmentClassification: newCls === 'Payroll' ? (editFormData.employmentClassification || 'All') : undefined,
                        });
                      }}
                      className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium cursor-pointer"
                    >
                      <option value="Communication">Communication</option>
                      <option value="Payroll">Payroll</option>
                      <option value="Request">Request</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Document Types to be Used For *
                    </label>
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 space-y-1">
                      {[...getCatalogTypes(editFormData.classification), 'All'].map(type => {
                        const selected = workflowTypes(editFormData).includes(type);
                        return <label key={type} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-blue-50 cursor-pointer">
                          <input type="checkbox" checked={selected} onChange={() => {
                            const current = workflowTypes(editFormData);
                            const next = type === 'All' ? (selected ? [] : ['All']) : (selected ? current.filter(item => item !== type) : [...current.filter(item => item !== 'All'), type]);
                            setEditFormData({ ...editFormData, documentType: next[0] || '', documentTypes: next });
                          }} />
                          {type === 'All' ? 'All Documents in this Classification' : type}
                        </label>;
                      })}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Select one or more document types.</p>
                  </div>

                  {editFormData.classification === 'Payroll' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Employment Classification to be Used For
                      </label>
                      <select
                        value={editFormData.employmentClassification || 'All'}
                        onChange={e => setEditFormData({ 
                          ...editFormData, 
                          employmentClassification: e.target.value as any 
                        })}
                        className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium cursor-pointer"
                      >
                        <option value="All">All Employment Classifications</option>
                        <option value="Job Order (JOW)">Job Order (JOW)</option>
                        <option value="Regular">Regular</option>
                        <option value="Casual">Casual</option>
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Optionally target a specific employment group (JOW, Regular, Casual) or keep as All.
                      </p>
                    </div>
                  )}

                  <div className="sm:col-span-2 pt-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="edit-active-toggle"
                      checked={editFormData.isActive}
                      onChange={e => setEditFormData({ ...editFormData, isActive: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                    <label htmlFor="edit-active-toggle" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Active Workflow (Automatically applied when registering matching documents)
                    </label>
                  </div>
                </div>
              </div>

              {/* Section 2: Sequential Step Builder */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Workflow Routing Phases ({editFormData.steps.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddEditStep}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Phase</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {editFormData.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-xs sm:text-sm text-slate-900">
                            Phase {idx + 1} Configuration
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Move phase up"
                            disabled={idx === 0}
                            onClick={() => handleMoveEditStep(idx, 'up')}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Move phase down"
                            disabled={idx === editFormData.steps.length - 1}
                            onClick={() => handleMoveEditStep(idx, 'down')}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete phase"
                            onClick={() => handleRemoveEditStep(idx)}
                            className="p-1 rounded hover:bg-rose-50 text-rose-600 cursor-pointer ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Phase Title *
                          </label>
                          <input
                            type="text"
                            value={step.name}
                            onChange={e => handleEditStepChange(idx, 'name', e.target.value)}
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Phase Type</label>
                          <select value={stageTypeOf(step)} onChange={e => handleEditStageTypeChange(idx, e.target.value as NonNullable<WorkflowStepTemplate['stageType']>)} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer">
                            <option value="INTERNAL_PROCESSING">Internal Processing</option><option value="EXTERNAL_HANDOFF_REVIEW">External Handoff / Review</option><option value="FINAL_RELEASE">Final Release</option>
                          </select>
                        </div>

                        <div className={stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? 'hidden' : ''}>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Required Processing Action
                          </label>
                          <select
                            value={step.requiredAction}
                            onChange={e => handleEditStepChange(idx, 'requiredAction', e.target.value as any)}
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
                          >
                            {REQUIRED_ACTIONS.map(act => (
                              <option key={act} value={act}>
                                {act}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Task Instructions / Description
                          </label>
                          <input
                            type="text"
                            value={step.description}
                            onChange={e => handleEditStepChange(idx, 'description', e.target.value)}
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>

                        <div className={stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? 'hidden' : ''}>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] font-semibold text-slate-700">
                              Assignee Type & Designation
                            </label>
                            <button
                              type="button"
                              onClick={() => setIsDesignationsModalOpen(true)}
                              className="text-[10px] text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center gap-0.5 cursor-pointer"
                              title="Add, edit, or delete designations & teams"
                            >
                              <Sliders className="w-2.5 h-2.5" />
                              Manage
                            </button>
                          </div>
                          <select
                            value={step.assigneeName}
                            onChange={e => {
                              const chosen = e.target.value;
                              if (chosen === '__MANAGE__') {
                                setIsDesignationsModalOpen(true);
                                return;
                              }
                              const roleMatch = assigneeDesignations.find(r => r.title === chosen && r.category === 'Role');
                              if (roleMatch) {
                                handleEditStepChange(idx, 'assigneeType', 'Role');
                                handleEditStepChange(idx, 'assigneeRole', roleMatch.baseRole || 'processor');
                                handleEditStepChange(idx, 'assigneeName', roleMatch.title);
                              } else {
                                handleEditStepChange(idx, 'assigneeType', 'Team');
                                handleEditStepChange(idx, 'assigneeTeam', chosen);
                                handleEditStepChange(idx, 'assigneeName', chosen);
                              }
                            }}
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer font-medium"
                          >
                            <optgroup label="Government & Department Roles">
                              {availableRoleDesignations.map(r => (
                                <option key={r.id} value={r.title}>
                                  {r.title}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Divisions & Teams">
                              {assigneeDesignations.filter(d => d.category === 'Team').map(t => (
                                <option key={t.id} value={t.title}>
                                  {t.title}
                                </option>
                              ))}
                            </optgroup>
                            <option value="__MANAGE__">+ Add, Edit or Delete Designations...</option>
                          </select>
                        </div>

                        <div className={stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? 'hidden' : ''}>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Person in Charge
                          </label>
                          <select aria-label="Assigned officer" value={step.assigneeUserId || ''} onChange={e => {
                              const user = users.find(u => u.id === e.target.value);
                              handleEditStepChange(idx, 'assigneeType', user ? 'Person' : 'Role');
                              handleEditStepChange(idx, 'assigneeUserId', user?.id);
                              if (user) handleEditStepChange(idx, 'assigneeName', user.name);
                            }} className="w-full text-xs border rounded-lg p-2"><option value="">Use role or team queue</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.roleTitle}</option>)}</select>
                        </div>

                        <div className={`${stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? 'hidden' : ''} sm:col-span-2 flex flex-wrap items-center gap-4 pt-1`}>
                          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer"><input type="checkbox" checked={step.allowHold ?? false} onChange={e => handleEditStepChange(idx, 'allowHold', e.target.checked)} className="w-3.5 h-3.5 text-amber-600 rounded cursor-pointer" /><span>Allow Hold at this Phase</span></label>
                          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={step.allowReturn}
                              onChange={e => handleEditStepChange(idx, 'allowReturn', e.target.checked)}
                              className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                            />
                            <span>Allow Return for Rework</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={step.requiresAttachment}
                              onChange={e => handleEditStepChange(idx, 'requiresAttachment', e.target.checked)}
                              className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                            />
                            <span>Mandatory Supporting File Attachment</span>
                          </label>
                        </div>

                        {stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' && <ExternalStageFields step={step} onChange={(field, value) => handleEditStepChange(idx, field, value)} designations={assigneeDesignations} users={users} onManage={() => setIsDesignationsModalOpen(true)} />}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditing}
                    className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Workflow Changes</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* CREATE WORKFLOW MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold">
                    Create Workflow Engine Template
                  </h2>
                  <p className="text-xs text-slate-400">
                    Define sequential approval phases and bind template to specific documents.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              
              {/* Section 1: Template Info & Target Document */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  1. Template Details & Document Assignment
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Template Title *
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      required
                      placeholder="e.g. Special Travel Order Routing Pipeline"
                      className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Description / Operational Purpose
                    </label>
                    <textarea
                      rows={2}
                      value={newDescription}
                      onChange={e => setNewDescription(e.target.value)}
                      placeholder="Describe the sequential checks, signatories, or legal requirements..."
                      className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Document Classification *
                    </label>
                    <select
                      value={newClassification}
                      onChange={e => {
                        const cls = e.target.value as DocumentClassification;
                        setNewClassification(cls);
                        const cat = getCatalogTypes(cls);
                        setNewDocTypeSelection(cat[0] ? [cat[0]] : ['All']);
                        if (cls !== 'Payroll') {
                          setNewEmploymentClassification('All');
                        }
                      }}
                      className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium cursor-pointer"
                    >
                      <option value="Communication">Communication</option>
                      <option value="Payroll">Payroll</option>
                      <option value="Request">Request</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Document Types to be Used For *
                    </label>
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 space-y-1">
                      {[...getCatalogTypes(newClassification), 'All'].map(type => {
                        const selected = newDocTypeSelection.includes(type);
                        return <label key={type} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-blue-50 cursor-pointer">
                          <input type="checkbox" checked={selected} onChange={() => setNewDocTypeSelection(current => type === 'All' ? (selected ? [] : ['All']) : (selected ? current.filter(item => item !== type) : [...current.filter(item => item !== 'All'), type]))} />
                          {type === 'All' ? 'All Documents in this Classification' : type}
                        </label>;
                      })}
                    </div>
                    <input
                      type="text"
                      value={newCustomDocType}
                      onChange={e => setNewCustomDocType(e.target.value)}
                      placeholder="Optional custom document type..."
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 mt-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {newClassification === 'Payroll' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Employment Classification to be Used For
                      </label>
                      <select
                        value={newEmploymentClassification}
                        onChange={e => setNewEmploymentClassification(e.target.value as any)}
                        className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium cursor-pointer"
                      >
                        <option value="All">All Employment Classifications</option>
                        <option value="Job Order (JOW)">Job Order (JOW)</option>
                        <option value="Regular">Regular</option>
                        <option value="Casual">Casual</option>
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Optionally target a specific employment group (JOW, Regular, Casual) or keep as All.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Steps Builder */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      2. Configure Sequential Phases ({newSteps.length})
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Tasks move automatically to the next queue once each phase completes.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCreateStep}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Phase</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {newSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-xs sm:text-sm text-slate-900">
                            Phase {idx + 1}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Move up"
                            disabled={idx === 0}
                            onClick={() => handleMoveCreateStep(idx, 'up')}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            disabled={idx === newSteps.length - 1}
                            onClick={() => handleMoveCreateStep(idx, 'down')}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete phase"
                            onClick={() => handleRemoveCreateStep(idx)}
                            className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Phase Title *
                          </label>
                          <input
                            type="text"
                            value={step.name}
                            onChange={e => handleCreateStepChange(idx, 'name', e.target.value)}
                            required
                            placeholder="e.g. Budget Allocation Verification"
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 focus:outline-none font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Phase Type</label>
                          <select value={stageTypeOf(step)} onChange={e => handleCreateStageTypeChange(idx, e.target.value as NonNullable<WorkflowStepTemplate['stageType']>)} className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer">
                            <option value="INTERNAL_PROCESSING">Internal Processing</option><option value="EXTERNAL_HANDOFF_REVIEW">External Handoff / Review</option><option value="FINAL_RELEASE">Final Release</option>
                          </select>
                        </div>

                        <div className={stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? 'hidden' : ''}>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Required Processing Action
                          </label>
                          <select
                            value={step.requiredAction}
                            onChange={e => handleCreateStepChange(idx, 'requiredAction', e.target.value as any)}
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
                          >
                            {REQUIRED_ACTIONS.map(act => (
                              <option key={act} value={act}>
                                {act}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Task Instructions
                          </label>
                          <input
                            type="text"
                            value={step.description}
                            onChange={e => handleCreateStepChange(idx, 'description', e.target.value)}
                            placeholder="Describe required assessment..."
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>

                        <div className={stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? 'hidden' : ''}>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] font-semibold text-slate-700">
                              Assigned Role or Department
                            </label>
                            <button
                              type="button"
                              onClick={() => setIsDesignationsModalOpen(true)}
                              className="text-[10px] text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center gap-0.5 cursor-pointer"
                              title="Add, edit, or delete designations & teams"
                            >
                              <Sliders className="w-2.5 h-2.5" />
                              Manage
                            </button>
                          </div>
                          <select
                            value={step.assigneeName}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '__MANAGE__') {
                                setIsDesignationsModalOpen(true);
                                return;
                              }
                              const roleMatch = assigneeDesignations.find(r => r.title === val && r.category === 'Role');
                              if (roleMatch) {
                                handleCreateStepChange(idx, 'assigneeType', 'Role');
                                handleCreateStepChange(idx, 'assigneeRole', roleMatch.baseRole || 'processor');
                                handleCreateStepChange(idx, 'assigneeName', roleMatch.title);
                              } else {
                                handleCreateStepChange(idx, 'assigneeType', 'Team');
                                handleCreateStepChange(idx, 'assigneeTeam', val);
                                handleCreateStepChange(idx, 'assigneeName', val);
                              }
                            }}
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer font-medium"
                          >
                            <optgroup label="Government & Department Roles">
                              {availableRoleDesignations.map(r => (
                                <option key={r.id} value={r.title}>
                                  {r.title}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Divisions & Teams">
                              {assigneeDesignations.filter(d => d.category === 'Team').map(t => (
                                <option key={t.id} value={t.title}>
                                  {t.title}
                                </option>
                              ))}
                            </optgroup>
                            <option value="__MANAGE__">+ Add, Edit or Delete Designations...</option>
                          </select>
                        </div>

                        <div className={stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? 'hidden' : ''}>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Person in Charge
                          </label>
                          <select aria-label="Assigned officer" value={step.assigneeUserId || ''} onChange={e => {
                              const user = users.find(u => u.id === e.target.value);
                              handleCreateStepChange(idx, 'assigneeType', user ? 'Person' : 'Role');
                              handleCreateStepChange(idx, 'assigneeUserId', user?.id);
                              if (user) handleCreateStepChange(idx, 'assigneeName', user.name);
                            }} className="w-full text-xs border rounded-lg p-2"><option value="">Use role or team queue</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.roleTitle}</option>)}</select>
                        </div>

                        <div className={`${stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' ? 'hidden' : ''} sm:col-span-2 flex flex-wrap items-center gap-4 pt-1`}>
                          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer"><input type="checkbox" checked={step.allowHold ?? false} onChange={e => handleCreateStepChange(idx, 'allowHold', e.target.checked)} className="w-3.5 h-3.5 text-amber-600 rounded cursor-pointer" /><span>Allow Hold at this Phase</span></label>
                          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={step.allowReturn}
                              onChange={e => handleCreateStepChange(idx, 'allowReturn', e.target.checked)}
                              className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                            />
                            <span>Allow Return for Rework</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={step.requiresAttachment}
                              onChange={e => handleCreateStepChange(idx, 'requiresAttachment', e.target.checked)}
                              className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                            />
                            <span>Mandatory Attachment</span>
                          </label>
                        </div>
                        {stageTypeOf(step) === 'EXTERNAL_HANDOFF_REVIEW' && <ExternalStageFields step={step} onChange={(field, value) => handleCreateStepChange(idx, field, value)} designations={assigneeDesignations} users={users} onManage={() => setIsDesignationsModalOpen(true)} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Create Workflow Template</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                Delete Workflow Template?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to delete this workflow template? Incoming documents for this type will fall back to default classification routing. Active documents will retain their current phases.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignee Designations & Teams Modal */}
      <AssigneeDesignationsModal
        isOpen={isDesignationsModalOpen}
        onClose={() => setIsDesignationsModalOpen(false)}
      />

    </div>
  );
};
