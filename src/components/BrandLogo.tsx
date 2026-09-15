import React from 'react';

export const BrandLogo: React.FC<{ className?: string; title?: string }> = ({ className = 'h-10 w-10', title }) => (
  <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} xmlns="http://www.w3.org/2000/svg">
    {title && <title>{title}</title>}
    <defs>
      <linearGradient id="hrmdo-brand-gradient" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3b82f6" />
        <stop offset="1" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#hrmdo-brand-gradient)" />
    <path d="M17 29.5h30v20.25a4.25 4.25 0 0 1-4.25 4.25h-21.5A4.25 4.25 0 0 1 17 49.75V29.5Z" fill="#fff" />
    <path d="M14.5 25.5a3 3 0 0 1 3-3h29a3 3 0 0 1 3 3v6h-35v-6Z" fill="#dbeafe" stroke="#fff" strokeWidth="3" />
    <path d="M26 39h12M26 46h8" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
    <path d="M22 16h20M22 16l5 6M42 16l-5 6" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="22" cy="16" r="4" fill="#bfdbfe" stroke="#fff" strokeWidth="2" />
    <circle cx="42" cy="16" r="4" fill="#bfdbfe" stroke="#fff" strokeWidth="2" />
    <circle cx="32" cy="9" r="4" fill="#fff" />
    <path d="M32 13v7" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
