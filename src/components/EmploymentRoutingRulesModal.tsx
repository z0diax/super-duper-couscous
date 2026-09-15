import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { EmploymentRoutingRule, EmploymentClassification } from '../types';
import { X, Sliders, CheckCircle2, UserCheck, ShieldAlert, Clock, Save } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const EmploymentRoutingRulesModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { employmentRoutingRules, updateEmploymentRoutingRule, users, showToast } = useApp();
  const [editingRule, setEditingRule] = useState<EmploymentRoutingRule | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [assignmentMode, setAssignmentMode] = useState<'fixed' | 'pool' | 'team'>('fixed');
  const [eligibleUserIds, setEligibleUserIds] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [slaHours, setSlaHours] = useState<number>(24);
  const teams = Array.from(new Set(users.flatMap(user => [user.division, user.office]).filter(Boolean))).sort();

  if (!isOpen) return null;

  const handleStartEdit = (rule: EmploymentRoutingRule) => {
    setEditingRule(rule);
    setAssignmentMode(rule.assignmentMode || 'fixed');
    setSelectedUserId(rule.primaryProcessorId || users[0]?.id || '');
    setEligibleUserIds(rule.eligibleProcessorIds || []);
    setSelectedTeam(rule.assignedTeam || teams[0] || '');
    setSlaHours(rule.defaultSlaHours || 24);
  };

  const handleSave = async () => {
    if (!editingRule) return;
    const targetUser = users.find(u => u.id === selectedUserId);
    if (assignmentMode === 'fixed' && !targetUser) {
      showToast('error', 'Assignee required', 'Choose an existing personnel account before saving this routing rule.');
      return;
    }
    if (assignmentMode === 'pool' && eligibleUserIds.length === 0) { showToast('error', 'Personnel required', 'Choose at least one eligible processor.'); return; }
    if (assignmentMode === 'team' && !selectedTeam) { showToast('error', 'Team required', 'Choose a team for this routing rule.'); return; }

    if (!(await updateEmploymentRoutingRule({
      ...editingRule,
      assignmentMode,
      primaryProcessorId: assignmentMode === 'fixed' ? targetUser!.id : '',
      primaryProcessorName: assignmentMode === 'fixed' ? targetUser!.name : '',
      primaryProcessorRoleTitle: assignmentMode === 'fixed' ? targetUser!.roleTitle : '',
      eligibleProcessorIds: assignmentMode === 'pool' ? eligibleUserIds : [],
      assignedTeam: assignmentMode === 'team' ? selectedTeam : '',
      defaultSlaHours: Number(slaHours) || 24,
    }))) return;
    setEditingRule(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Employment Routing Rules</h2>
              <p className="text-xs text-slate-500">
                Choose how each payroll classification is assigned
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
            <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Classification routing</p>
              <p className="text-blue-700">
                Each classification can route to one person, a personnel pool, or a team queue.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {employmentRoutingRules.map(rule => {
              const isEditing = editingRule?.id === rule.id;
              const assignedLabel = rule.assignmentMode === 'pool'
                ? (rule.eligibleProcessorIds || []).map(id => users.find(user => user.id === id)?.name).filter(Boolean).join(', ') || 'No personnel selected'
                : rule.assignmentMode === 'team' ? rule.assignedTeam || 'No team selected' : rule.primaryProcessorName;
              return (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isEditing 
                      ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/10' 
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          rule.classification === 'JOW/COS'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : rule.classification === 'Casual'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {rule.classification}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">{rule.title}</h3>
                      </div>
                      <p className="text-xs text-slate-500">{rule.description}</p>
                    </div>

                    {!isEditing && (
                      <button
                        onClick={() => handleStartEdit(rule)}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                      >
                        Edit routing
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                      <div><label className="mb-1 block text-xs font-medium text-slate-700">Assignment method</label><select value={assignmentMode} onChange={event => setAssignmentMode(event.target.value as 'fixed' | 'pool' | 'team')} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="fixed">Fixed Personnel</option><option value="pool">Personnel Pool</option><option value="team">Team Queue</option></select></div>
                      {assignmentMode === 'fixed' && <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Assigned personnel
                        </label>
                        <select
                          aria-label={`${rule.classification} primary processor`}
                          required
                          value={selectedUserId}
                          onChange={e => setSelectedUserId(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="" disabled>Choose personnel...</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} — {u.roleTitle} ({u.office})
                            </option>
                          ))}
                        </select>
                      </div>}
                      {assignmentMode === 'pool' && <div><p className="mb-2 text-xs font-medium text-slate-700">Eligible personnel</p><div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">{users.map(user => <label key={user.id} className="flex items-start gap-2 rounded-md p-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={eligibleUserIds.includes(user.id)} onChange={event => setEligibleUserIds(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))} className="mt-0.5 h-4 w-4"/><span><strong className="block text-slate-800">{user.name}</strong><span className="text-slate-500">{user.roleTitle}</span></span></label>)}</div></div>}
                      {assignmentMode === 'team' && <div><label className="mb-1 block text-xs font-medium text-slate-700">Assigned team</label><select value={selectedTeam} onChange={event => setSelectedTeam(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Choose a team...</option>{teams.map(team => <option key={team} value={team}>{team}</option>)}</select></div>}

                      <div className="flex items-center justify-between gap-4 pt-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-slate-700">SLA Hours:</label>
                          <input
                            type="number"
                            min={1}
                            max={168}
                            value={slaHours}
                            onChange={e => setSlaHours(Number(e.target.value))}
                            className="w-20 px-2 py-1 text-xs border border-slate-300 rounded-md"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingRule(null)}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSave}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Save Rule
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{(rule.assignmentMode || 'fixed') === 'fixed' ? 'Assigned personnel:' : (rule.assignmentMode === 'pool' ? 'Personnel pool:' : 'Team queue:')}</span>
                        <span className="font-semibold text-slate-800">{assignedLabel}</span>
                        {(rule.assignmentMode || 'fixed') === 'fixed' && <span className="text-slate-400">({rule.primaryProcessorRoleTitle})</span>}
                      </div>
                      <div className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>SLA: {rule.defaultSlaHours}h</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
