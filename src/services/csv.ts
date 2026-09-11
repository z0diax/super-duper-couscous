export function exportCsv(filename: string, rows: unknown[][]) {
  const content = rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
