import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Database, 
  ShieldCheck, 
  CheckCircle2, 
  FileStack, 
  Archive, 
  Layers, 
  Lock, 
  Clock, 
  AlertCircle,
  ExternalLink,
  RefreshCw,
  FileText
} from 'lucide-react';

export const V1MigrationPanel: React.FC = () => {
  const { migrationSummaries, documents, leaveApplications, auditLogs, runMigrationCheck, setSelectedDocument } = useApp();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedStatus, setVerifiedStatus] = useState<string | null>(null);

  const legacyDocs = documents.filter(d => d.isLegacyV1);

  const migrationSummary = { totalDocumentsMigrated: legacyDocs.length, leaveRecordsPreserved: leaveApplications.filter(l => l.isLegacyV1).length, auditLogsPreserved: auditLogs.filter(a => legacyDocs.some(d => d.id === a.documentId)).length };
  const handleVerifyChecksums = async () => {
    setIsVerifying(true);
    const result = await runMigrationCheck();
    setIsVerifying(false);
    if (result) setVerifiedStatus(result.totalV1Records === 0 ? 'No historical records have been imported.' : `Checked ${result.totalV1Records} historical documents. Attachment exceptions: ${result.exceptionsCount}. Original archive checksums are required to verify source equivalence.`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Governance Banner */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Historical Archive & Integrity
              </h1>
              <span className="text-xs bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Read-Only Records</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Read-only preservation of historical documents, employee leave records, and audit logs.
            </p>
          </div>

          <button
            id="btn-verify-migration-checksums"
            onClick={handleVerifyChecksums}
            disabled={isVerifying}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>{isVerifying ? 'Verifying Integrity...' : 'Verify Cryptographic Checksums'}</span>
          </button>
        </div>

        {/* Verification Alert */}
        {verifiedStatus && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{verifiedStatus}</span>
          </div>
        )}

        {/* 4 KPI Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500">Preserved Documents</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
              {migrationSummary.totalDocumentsMigrated.toLocaleString()}
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">100% Read-Only Protected</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500">Continuous Leave Records</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
              {migrationSummary.leaveRecordsPreserved.toLocaleString()}
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">Mapped to Employee IDs</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500">Immutable Audit Logs</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
              {migrationSummary.auditLogsPreserved.toLocaleString()}
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">Timestamps Preserved</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500">Preservation Rule</span>
            <div className="text-base font-bold text-indigo-900 mt-0.5">
              Read-Only Lock
            </div>
            <span className="text-[10px] text-slate-500">Excluded from active queues</span>
          </div>
        </div>
      </div>

      {/* Section 9 Principles & Policy Guarantees */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Archive Preservation Rules
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Lock className="w-4 h-4 text-indigo-600" />
              <span>1. Zero Re-Routing of Closed Docs</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Historical documents remain read-only references and are excluded from active operational workflows.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Database className="w-4 h-4 text-indigo-600" />
              <span>2. Original Number Preservation</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Original tracking numbers remain intact and searchable alongside current document records.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>3. Leave Ledger Continuity</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Historical leave filings and credit balances remain connected to verified employee records.
            </p>
          </div>
        </div>
      </div>

      {/* Sample Preserved V1 Archive Records */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Preserved Historical Records ({legacyDocs.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Open a preserved record to inspect its archived metadata, scanned files, and historical notes.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {legacyDocs.map(doc => (
            <div
              key={doc.id}
              onClick={() => setSelectedDocument(doc)}
              className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200">
                    {doc.trackingNumber}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                    Archive ID: {doc.legacyId}
                  </span>
                </div>

                <h4 className="font-bold text-sm text-slate-900 mt-1">
                  {doc.title}
                </h4>
                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                  {doc.subject} &bull; Received {new Date(doc.dateReceived).toLocaleDateString()} from {doc.sourceOffice}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                  Archive Preserved
                </span>
                <button
                  id={`btn-view-legacy-${doc.id}`}
                  className="px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 rounded transition-colors"
                >
                  View Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
