// Icons for exporting files: a sheet of paper with the file type written on it, so "CSV" and "PDF" read at a glance.
function FileBadge({ label, className }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <text x="12" y="17.2" textAnchor="middle" fontSize="6.4" fontWeight="800" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">
        {label}
      </text>
    </svg>
  );
}

export const CsvIcon = ({ className }: { className?: string }) => <FileBadge label="CSV" className={className} />;
export const PdfIcon = ({ className }: { className?: string }) => <FileBadge label="PDF" className={className} />;
