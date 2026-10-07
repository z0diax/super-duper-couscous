import React from 'react';

export type NavIconType = 'dashboard' | 'queues' | 'payroll' | 'registry' | 'leave' | 'workflows' | 'catalogue' | 'users' | 'migration' | 'audit';

// Named local artwork gives independent parts stable identities in Lucide's
// 24-unit coordinate grid, without depending on library path ordering.
export function NavIconArtwork({ type }: { type: NavIconType }) {
  switch (type) {
    case 'dashboard':
      return <>
        <rect className="icon-part dashboard-tile dashboard-tile-1" x="3" y="3" width="7" height="7" rx="1" />
        <rect className="icon-part dashboard-tile dashboard-tile-2" x="14" y="3" width="7" height="7" rx="1" />
        <rect className="icon-part dashboard-tile dashboard-tile-3" x="3" y="14" width="7" height="7" rx="1" />
        <rect className="icon-part dashboard-tile dashboard-tile-4" x="14" y="14" width="7" height="7" rx="1" />
      </>;
    case 'queues':
      return <>
        <path className="icon-static inbox-body" d="M3 13 6 4h12l3 9v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        <g className="icon-part icon-transient inbox-item">
          <rect x="9" y="4" width="6" height="5" rx="1" />
          <path d="M11 6.5h2" />
        </g>
        <path className="icon-part inbox-tray" d="M3 13h5l2 3h4l2-3h5" />
      </>;
    case 'payroll':
      return <>
        <path className="icon-part payroll-top" d="m12 3 9 5-9 5-9-5Z" />
        <path className="icon-part payroll-middle" d="m3 12 9 5 9-5" />
        <path className="icon-part payroll-bottom" d="m3 16 9 5 9-5" />
      </>;
    case 'registry':
      return <>
        <path className="icon-static registry-rear" d="M5 7H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1" />
        <g className="icon-part registry-front">
          <path d="M9 3h6l4 4v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M15 3v4h4M11 11h5M11 14h3" />
        </g>
      </>;
    case 'leave':
      return <>
        <g className="icon-static calendar-body">
          <path d="M9 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3M3 10h18M8 3v4M16 3v4" />
        </g>
        <circle className="icon-part calendar-clock" cx="17" cy="17" r="5" />
        <path className="icon-part calendar-minute" d="M17 17v-3" />
        <path className="icon-part calendar-hour" d="M17 17h2.5" />
      </>;
    case 'workflows':
      return <>
        <path className="icon-static workflow-connection" d="M6 8v8M6 8v1a5 5 0 0 0 5 5h4a3 3 0 0 0 3-3V8" />
        <path className="icon-part icon-transient workflow-travel" pathLength="1" d="M6 8v1a5 5 0 0 0 5 5h4a3 3 0 0 0 3-3V8" />
        <path className="icon-part icon-transient workflow-branch-travel" pathLength="1" d="M6 8v8" />
        <circle className="icon-part workflow-source" cx="6" cy="5" r="3" />
        <circle className="icon-part workflow-destination" cx="18" cy="5" r="3" />
        <circle className="icon-part workflow-branch" cx="6" cy="19" r="3" />
      </>;
    case 'catalogue':
      return <>
        <path className="icon-static catalogue-rear" d="m15 3 6 6a2 2 0 0 1 0 3l-7 7" />
        <g className="icon-part catalogue-front">
          <path d="M3 3h7l8 8a2 2 0 0 1 0 3l-4 4a2 2 0 0 1-3 0l-8-8Z" />
          <circle className="icon-part catalogue-hole" cx="7" cy="7" r=".8" />
        </g>
      </>;
    case 'users':
      return <>
        <g className="icon-part users-left"><path d="M6 5a3 3 0 1 0 0 6M3 20v-2a4 4 0 0 1 3-3" /></g>
        <g className="icon-part users-right"><path d="M18 5a3 3 0 1 1 0 6M21 20v-2a4 4 0 0 0-3-3" /></g>
        <path className="icon-static users-center-body" d="M7 21v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2" />
        <circle className="icon-part users-center-head" cx="12" cy="7" r="3" />
      </>;
    case 'migration':
      return <>
        <g className="icon-static archive-body">
          <ellipse cx="12" cy="6" rx="9" ry="3" />
          <path d="M3 6v12c0 1.66 4 3 9 3s9-1.34 9-3V6" />
        </g>
        <path className="icon-part archive-shelf" d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        <g className="icon-part icon-transient archive-record">
          <rect x="9" y="2" width="6" height="5" rx="1" />
          <path d="M11 4.5h2" />
        </g>
      </>;
    case 'audit':
      return <>
        <path className="icon-part audit-trail" pathLength="1" d="M3 10a9 9 0 1 1 .7 6" />
        <path className="icon-part audit-arrow" d="M3 4v6h6" />
        <path className="icon-part audit-hand" d="M12 7v5l3 2" />
      </>;
  }
}
