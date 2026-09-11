import type { WorkflowTemplate } from '../types';
export function resolveWorkflow(templates: WorkflowTemplate[], classification: string, documentType: string, employment?: string) {
  const matches = templates.filter(w => w.isActive && w.steps.length && w.classification === classification
    && (w.documentTypes?.length ? w.documentTypes : [w.documentType]).some(type => [documentType.toLowerCase(), 'all', 'default'].includes(type.toLowerCase()))
    && (!w.employmentClassification || w.employmentClassification === 'All' || w.employmentClassification === employment))
    .map(w => ({ workflow: w, score: ((w.documentTypes?.length ? w.documentTypes : [w.documentType]).some(type => type.toLowerCase() === documentType.toLowerCase()) ? 2 : 0) + (w.employmentClassification && w.employmentClassification !== 'All' ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
  return matches.length && (matches.length === 1 || matches[0].score !== matches[1].score) ? matches[0].workflow : undefined;
}
