import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { SidebarModule, UserAccount, UserRole } from '../types';
import { AssigneeDesignationsModal } from './AssigneeDesignationsModal';
import { SystemRolesModal } from './SystemRolesModal';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  Shield, 
  ShieldCheck,
  Building, 
  Mail, 
  CheckCircle2, 
  Edit3, 
  Trash2, 
  LogIn, 
  Sliders, 
  Briefcase, 
  LayoutGrid, 
  List, 
  Inbox, 
  Clock, 
  Plus, 
  X, 
  Check, 
  AlertCircle,
  FileText,
  Building2
} from 'lucide-react';

const ROLE_CONFIGS: Record<UserRole, { label: string; badgeClass: string; desc: string }> = {
  receiving_officer: {
    label: 'Receiving Officer',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    desc: 'Document intake & logging',
  },
  processor: {
    label: 'Processor',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    desc: 'Payroll computation & verification',
  },
  reviewer: {
    label: 'Reviewer',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    desc: 'Compliance & substantive review',
  },
  approver: {
    label: 'Approver / Director',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    desc: 'Executive signature & approval',
  },
  releasing_officer: {
    label: 'Releasing Officer',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    desc: 'Dispatch & archive custody',
  },
  supervisor: {
    label: 'Supervisor',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    desc: 'Workflow oversight & SLAs',
  },
  admin: {
    label: 'Administrator',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    desc: 'System governance & config',
  },
  employee: {
    label: 'Personnel / Staff',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
    desc: 'General access & requestor',
  },
};

const PERSONNEL_LIST_PAGE_SIZE = 10;

export const UsersDashboard: React.FC = () => {
  const { 
    users, 
    currentUser,
    addUser, 
    updateUser, 
    deleteUser, 
    documents,
    assigneeDesignations,
    systemRoles 
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [divisionFilter, setDivisionFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [personnelListPage, setPersonnelListPage] = useState(1);
  
  // Modals state
  const [isDesignationsModalOpen, setIsDesignationsModalOpen] = useState(false);
  const [isSystemRolesModalOpen, setIsSystemRolesModalOpen] = useState(false);
  const [selectedRoleIdForModal, setSelectedRoleIdForModal] = useState<string | undefined>(undefined);
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [password, setPassword] = useState('');

  // User form data state
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: UserRole;
    roleTitle: string;
    position: string;
    division: string;
    office: string;
    sidebarModules: SidebarModule[];
  }>({
    name: '',
    email: '',
    role: 'processor',
    roleTitle: 'Payroll & Compensation Processor',
    position: 'Human Resource Management Officer I',
    division: 'Compensation & Benefits Division',
    office: 'Human Resource Management and Development Office',
    sidebarModules: ['dashboard','queues','payroll','registry','leave'],
  });

  // Calculate active tasks per user
  const userTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach(u => { counts[u.id] = 0; });

    documents.forEach(doc => {
      if (doc.status === 'Released' || doc.status === 'Archived') return;
      const step = doc.workflowSteps.find(s => s.stepNumber === doc.currentStepNumber);
      if (!step) return;

      if (step.assignedTo.userId && counts[step.assignedTo.userId] !== undefined) {
        counts[step.assignedTo.userId] += 1;
      } else if (step.assignedTo.role) {
        // match users with that role
        users.forEach(u => {
          if (u.role === step.assignedTo.role) {
            counts[u.id] = (counts[u.id] || 0) + 1;
          }
        });
      }
    });

    return counts;
  }, [documents, users]);

  // Unique divisions for filter
  const divisionsList = useMemo(() => {
    const divs = new Set<string>();
    users.forEach(u => {
      if (u.division) divs.add(u.division);
    });
    return Array.from(divs);
  }, [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (divisionFilter !== 'all' && user.division !== divisionFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          user.name.toLowerCase().includes(q) ||
          user.email.toLowerCase().includes(q) ||
          user.roleTitle.toLowerCase().includes(q) ||
          user.position.toLowerCase().includes(q) ||
          user.division.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, roleFilter, divisionFilter, searchQuery]);
  const personnelListPageCount = Math.max(1, Math.ceil(filteredUsers.length / PERSONNEL_LIST_PAGE_SIZE));
  const currentPersonnelListPage = Math.min(Math.max(personnelListPage, 1), personnelListPageCount);
  const paginatedUsers = filteredUsers.slice(
    (currentPersonnelListPage - 1) * PERSONNEL_LIST_PAGE_SIZE,
    currentPersonnelListPage * PERSONNEL_LIST_PAGE_SIZE
  );

  useEffect(() => {
    setPersonnelListPage(1);
  }, [searchQuery, roleFilter, divisionFilter]);

  useEffect(() => {
    if (personnelListPage !== currentPersonnelListPage) setPersonnelListPage(currentPersonnelListPage);
  }, [personnelListPage, currentPersonnelListPage]);

  // Handle open add user
  const handleOpenAddUser = () => {
    setEditingUser(null); setPassword('');
    const defaultDesignation = assigneeDesignations.find(d => d.category === 'Role' && d.baseRole === 'processor') || {
      title: 'Payroll & Compensation Processor',
      baseRole: 'processor' as UserRole,
    };

    setFormData({
      name: '',
      email: '',
      role: defaultDesignation.baseRole || 'processor',
      roleTitle: defaultDesignation.title,
      position: 'HR Management Officer I',
      division: 'Compensation & Benefits Division',
      office: 'Human Resource Management and Development Office',
      sidebarModules: ['dashboard','queues','payroll','registry','leave'],
    });
    setIsUserFormOpen(true);
  };

  // Handle open edit user
  const handleOpenEditUser = (user: UserAccount) => {
    setEditingUser(user); setPassword('');
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      roleTitle: user.roleTitle,
      position: user.position,
      division: user.division,
      office: user.office,
      sidebarModules: user.sidebarModules || ['dashboard','queues','payroll','registry','leave'],
    });
    setIsUserFormOpen(true);
  };

  // Handle submit user form
  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) return;

    if (editingUser) {
      if (!(await updateUser({
        password,
        ...editingUser,
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        roleTitle: formData.roleTitle.trim(),
        position: formData.position.trim(),
        division: formData.division.trim(),
        office: formData.office.trim(),
        sidebarModules: formData.sidebarModules,
      }))) return;
    } else {
      if (!(await addUser({
        password,
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        roleTitle: formData.roleTitle.trim(),
        position: formData.position.trim(),
        division: formData.division.trim(),
        office: formData.office.trim(),
        sidebarModules: formData.sidebarModules,
      }))) return;
    }

    setIsUserFormOpen(false);
    setEditingUser(null);
  };

  // Role designations options
  const roleDesignationOptions = assigneeDesignations.filter(d => d.category === 'Role');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                Staff & Personnel Directory
              </span>
              <span className="text-xs text-slate-500">&bull;</span>
              <span className="text-xs text-slate-500 font-medium">HRMDO System Governance</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Users & Designations Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
              Manage personnel accounts, role designations, division teams, and view current active task workloads across processing desks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setSelectedRoleIdForModal(undefined);
                setIsSystemRolesModalOpen(true);
              }}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>System Base Roles</span>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {systemRoles.length}
              </span>
            </button>

            <button
              onClick={() => setIsDesignationsModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Sliders className="w-4 h-4 text-slate-500" />
              <span>Assignee Designations & Teams</span>
              <span className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {assigneeDesignations.length}
              </span>
            </button>

            <button
              onClick={handleOpenAddUser}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New Personnel</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <span className="text-xs font-medium text-slate-500 block">Total Registered Users</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">{users.length}</span>
              <span className="text-[11px] text-slate-500">Personnel</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <span className="text-xs font-medium text-slate-500 block">Processors & Reviewers</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-indigo-700">
                {users.filter(u => u.role === 'processor' || u.role === 'reviewer').length}
              </span>
              <span className="text-[11px] text-slate-500">Active Desks</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <span className="text-xs font-medium text-slate-500 block">Approvers & Executives</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-purple-700">
                {users.filter(u => u.role === 'approver' || u.role === 'supervisor').length}
              </span>
              <span className="text-[11px] text-slate-500">Signatories</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <span className="text-xs font-medium text-slate-500 block">Active Tasks In Flight</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-emerald-700">
                {Object.values(userTaskCounts).reduce((a: number, b: number) => a + b, 0)}
              </span>
              <span className="text-[11px] text-slate-500">Pending Actions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters, View Mode */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setPersonnelListPage(1);
              }}
              placeholder="Search by name, email, role, or position..."
              className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none focus:bg-white transition-all"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={roleFilter}
              onChange={e => {
                setRoleFilter(e.target.value);
                setPersonnelListPage(1);
              }}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="all">All Roles ({users.length})</option>
              {systemRoles.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({users.filter(u => u.role === r.id).length})
                </option>
              ))}
            </select>
          </div>

          {/* Division Filter */}
          <select
            value={divisionFilter}
            onChange={e => {
              setDivisionFilter(e.target.value);
              setPersonnelListPage(1);
            }}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="all">All Divisions</option>
            {divisionsList.map(div => (
              <option key={div} value={div}>{div}</option>
            ))}
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center justify-end gap-1.5 self-end sm:self-center">
          <span className="text-xs text-slate-500 mr-1">
            Showing <strong className="text-slate-800">{filteredUsers.length}</strong> personnel
          </span>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'grid' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'list' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Users Directory Presentation */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-xs">
          <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No personnel match your criteria</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Try resetting your search query or role/division filters to view other members of the HRMDO office.
          </p>
          <button
            onClick={() => { setSearchQuery(''); setRoleFilter('all'); setDivisionFilter('all'); setPersonnelListPage(1); }}
            className="mt-4 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            Clear Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Layout */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map(user => {
            const isCurrentUser = currentUser.id === user.id;
            const taskCount = userTaskCounts[user.id] || 0;
            const roleDef = systemRoles.find(r => r.id === user.role);
            const roleBadgeClass = roleDef?.badgeClass || ROLE_CONFIGS[user.role]?.badgeClass || 'bg-slate-100 text-slate-800 border-slate-200';
            const roleLabel = roleDef?.name || ROLE_CONFIGS[user.role]?.label || user.role;
            const isConfirmingDelete = confirmDeleteId === user.id;

            return (
              <div
                key={user.id}
                className={`bg-white rounded-2xl border transition-all p-5 shadow-xs flex flex-col justify-between ${
                  isCurrentUser ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top Badges & Switch */}
                  <div className="flex items-start justify-between gap-2 mb-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRoleIdForModal(user.role);
                          setIsSystemRolesModalOpen(true);
                        }}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full border hover:opacity-85 transition-opacity cursor-pointer flex items-center gap-1 ${roleBadgeClass}`}
                        title="Click to view/edit this system base role"
                      >
                        <span>{roleLabel}</span>
                        <Edit3 className="w-2.5 h-2.5 opacity-60" />
                      </button>
                      {user.isMigratedV1 && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                           Imported Account
                        </span>
                      )}
                    </div>

                    {isCurrentUser ? (
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-blue-600" />
                        Current Desk
                      </span>
                    ) : (
                      <></>
                    )}
                  </div>

                  {/* Profile Info */}
                  <div className="flex items-start gap-3.5 mb-3.5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                      {user.avatarInitials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 truncate" title={user.name}>
                        {user.name}
                      </h3>
                      <p className="text-xs font-semibold text-blue-600 mt-0.5 line-clamp-1">
                        {user.roleTitle}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {user.position}
                      </p>
                    </div>
                  </div>

                  {/* Office & Division Details */}
                  <div className="space-y-1.5 py-2.5 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2 text-slate-600 truncate">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate" title={user.division}>{user.division}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-600 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <a 
                        href={`mailto:${user.email}`} 
                        className="truncate hover:text-blue-600 hover:underline"
                        title={user.email}
                      >
                        {user.email}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Bottom Workload & Action Row */}
                <div className="pt-3.5 mt-2 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Inbox className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-600">
                      Active Tasks: <strong className={taskCount > 0 ? 'text-blue-700' : 'text-slate-700'}>{taskCount}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 p-1 rounded-lg">
                        <span className="text-[10px] text-rose-700 font-bold px-1">Confirm?</span>
                        <button
                          onClick={async () => {
                            if (!(await deleteUser(user.id))) return;
                            setConfirmDeleteId(null);
                          }}
                          className="p-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1 text-xs text-slate-600 hover:bg-slate-200 rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleOpenEditUser(user)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit user profile"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {!isCurrentUser && (
                          <button
                            onClick={() => setConfirmDeleteId(user.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table Layout */
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">User / Name</th>
                  <th className="py-3 px-4">Role Title & Designation</th>
                  <th className="py-3 px-4">Division & Office</th>
                  <th className="py-3 px-4">System Role</th>
                  <th className="py-3 px-4 text-center">Active Tasks</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedUsers.map(user => {
                  const isCurrentUser = currentUser.id === user.id;
                  const taskCount = userTaskCounts[user.id] || 0;
                  const roleDef = systemRoles.find(r => r.id === user.role);
                  const roleBadgeClass = roleDef?.badgeClass || ROLE_CONFIGS[user.role]?.badgeClass || 'bg-slate-100 text-slate-800 border-slate-200';
                  const roleLabel = roleDef?.name || ROLE_CONFIGS[user.role]?.label || user.role;
                  const isConfirmingDelete = confirmDeleteId === user.id;

                  return (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCurrentUser ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center shrink-0">
                            {user.avatarInitials}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">{user.name}</span>
                              {isCurrentUser && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-slate-500 text-[11px] block">{user.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold text-blue-700 block">{user.roleTitle}</span>
                        <span className="text-slate-500 text-[11px]">{user.position}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-slate-800 font-medium block">{user.division}</span>
                        <span className="text-slate-400 text-[11px]">{user.office}</span>
                      </td>

                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRoleIdForModal(user.role);
                            setIsSystemRolesModalOpen(true);
                          }}
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border hover:opacity-85 transition-opacity cursor-pointer inline-flex items-center gap-1 ${roleBadgeClass}`}
                          title="Click to view/edit this system base role"
                        >
                          <span>{roleLabel}</span>
                          <Edit3 className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      </td>

                      <td className="py-3 px-4 text-center font-bold">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          taskCount > 0 ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-400'
                        }`}>
                          {taskCount}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isCurrentUser && (
                            <></>
                          )}

                          <button
                            onClick={() => handleOpenEditUser(user)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit user profile"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {!isCurrentUser && (
                            isConfirmingDelete ? (
                              <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 p-0.5 rounded">
                                <button
                                  onClick={async () => {
                                    if (!(await deleteUser(user.id))) return;
                                    setConfirmDeleteId(null);
                                  }}
                                  className="p-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="p-1 text-xs text-slate-600 hover:bg-slate-200 rounded transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(user.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
          <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-500" aria-label="Personnel list pagination">
            <span>
              Showing {(currentPersonnelListPage - 1) * PERSONNEL_LIST_PAGE_SIZE + 1}&ndash;{Math.min(currentPersonnelListPage * PERSONNEL_LIST_PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} personnel
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPersonnelListPage(currentPersonnelListPage - 1)}
                disabled={currentPersonnelListPage === 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Previous
              </button>
              <span className="font-medium text-slate-600">Page {currentPersonnelListPage} of {personnelListPageCount}</span>
              <button
                type="button"
                onClick={() => setPersonnelListPage(currentPersonnelListPage + 1)}
                disabled={currentPersonnelListPage === personnelListPageCount}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}

      {/* Modal: Add / Edit User Form */}
      {isUserFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-xs sm:p-6">
          <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex shrink-0 items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  {editingUser ? <Edit3 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    {editingUser ? 'Edit Personnel Profile' : 'Register New Personnel'}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-300">Personnel account and access details</p>
                </div>
              </div>
              <button
                onClick={() => setIsUserFormOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitUser} className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-6 p-5 sm:p-6">
              <section>
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-slate-900">Account information</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Basic sign-in details for this personnel account.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Maria Santos"
                    className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="m.santos@hrmdo.gov.ph"
                    className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">
                  {editingUser ? 'New password' : 'Temporary password'} {!editingUser && <span className="text-rose-500">*</span>}
                  <input aria-label="Account password" type="password" autoComplete="new-password" required={!editingUser} minLength={3} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} placeholder={editingUser ? 'Leave blank to keep the current password' : 'Set an initial password'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </label>
              </div>
              </section>

              <section className="border-t border-slate-200 pt-5">
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-slate-900">Assignment details</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Designation, role, and organizational assignment.</p>
                </div>

              {/* Assignee Designation Select */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Designation <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsDesignationsModalOpen(true)}
                    className="text-[11px] text-blue-600 hover:underline font-medium"
                  >
                      Manage designations
                  </button>
                </div>
                <select
                  value={roleDesignationOptions.some(d => d.title === formData.roleTitle) ? formData.roleTitle : '__CUSTOM__'}
                  onChange={e => {
                    const chosenTitle = e.target.value;
                    const matched = roleDesignationOptions.find(d => d.title === chosenTitle);
                    setFormData({
                      ...formData,
                      roleTitle: chosenTitle,
                      role: matched?.baseRole || formData.role,
                    });
                  }}
                  className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                >
                  {roleDesignationOptions.map(des => (
                    <option key={des.id} value={des.title}>
                      {des.title} {des.baseRole ? `(${des.baseRole})` : ''}
                    </option>
                  ))}
                  <option value="__CUSTOM__">+ Custom Designation Title...</option>
                </select>

                {!roleDesignationOptions.some(d => d.title === formData.roleTitle) && (
                  <input
                    type="text"
                    required
                    placeholder="Enter custom role title..."
                    value={formData.roleTitle === '__CUSTOM__' ? '' : formData.roleTitle}
                    onChange={e => setFormData({ ...formData, roleTitle: e.target.value })}
                    className="w-full text-xs bg-white border border-blue-400 rounded-lg p-2 mt-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Access role <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoleIdForModal(formData.role);
                        setIsSystemRolesModalOpen(true);
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Manage roles</span>
                    </button>
                  </div>
                  <select
                    value={formData.role}
                    onChange={e => {
                      const selected = e.target.value as UserRole;
                      const matched = systemRoles.find(r => r.id === selected);
                      setFormData({ 
                        ...formData, 
                        role: selected,
                        roleTitle: matched ? matched.name : formData.roleTitle
                      });
                    }}
                    className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                  >
                    {systemRoles.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Position title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.position}
                    onChange={e => setFormData({ ...formData, position: e.target.value })}
                    placeholder="e.g. Administrative Officer IV"
                    className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Division or unit <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.division}
                    onChange={e => setFormData({ ...formData, division: e.target.value })}
                    placeholder="e.g. Compensation & Benefits Division"
                    className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Office <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.office}
                    onChange={e => setFormData({ ...formData, office: e.target.value })}
                    placeholder="Human Resource Management and Development Office"
                    className="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <div><h4 className="text-sm font-bold text-slate-900">Page access</h4><p className="mt-0.5 text-xs text-slate-500">Select the pages available to this account.</p></div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {([
                    ['dashboard','Dashboard'],['queues','My Tasks & Queues'],['payroll','Payroll Management'],['registry','Document Registry'],['leave','Leave Records'],
                  ] as Array<[SidebarModule,string]>).map(([module,label]) => {
                    const checked = formData.role === 'admin' || formData.sidebarModules.includes(module);
                    return <label key={module} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${checked ? 'border-blue-200 bg-white text-slate-800' : 'border-slate-200 bg-slate-100 text-slate-500'}`}><span className="font-medium">{label}</span><input type="checkbox" checked={checked} disabled={formData.role === 'admin'} onChange={event => setFormData(previous => ({ ...previous, sidebarModules: event.target.checked ? [...previous.sidebarModules, module] : previous.sidebarModules.filter(item => item !== module) }))} className="h-4 w-4 rounded border-slate-300 text-blue-600" /></label>;
                  })}
                </div>
                {formData.role === 'admin' && <p className="mt-2 text-xs text-blue-700">Administrators have access to all pages.</p>}
                {formData.role !== 'admin' && formData.sidebarModules.length === 0 && <p className="mt-2 text-xs font-semibold text-rose-600">Select at least one page.</p>}
              </section>
              </div>

              <div className="sticky bottom-0 flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
                <button
                  type="button"
                  onClick={() => setIsUserFormOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formData.role !== 'admin' && formData.sidebarModules.length === 0}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  {editingUser ? 'Update Profile' : 'Register Personnel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Assignee Designations & Teams Modal */}
      <AssigneeDesignationsModal
        isOpen={isDesignationsModalOpen}
        onClose={() => setIsDesignationsModalOpen(false)}
      />

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
  );
};
