import React from 'react';
import { LogOut, SlidersHorizontal } from 'lucide-react';

interface SidebarUserCardProps {
  displayName: string;
  avatarInitials: string;
  userEmail?: string;
  isPreferencesActive: boolean;
  onOpenPreferences: () => void;
  onSignOut?: () => void;
}

/** Pie del menú lateral: quién usa la app, acceso a sus preferencias y cierre de sesión. */
export const SidebarUserCard: React.FC<SidebarUserCardProps> = ({
  displayName,
  avatarInitials,
  userEmail,
  isPreferencesActive,
  onOpenPreferences,
  onSignOut,
}) => (
  <div className="p-3 border-t border-border shrink-0 bg-surface/50">
    <div className="flex items-center justify-between gap-1 p-2 rounded-lg bg-surface-2/60 border border-border/60">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary/30 to-surface-3 border border-border flex items-center justify-center text-xs font-bold text-text-primary shrink-0">
          {avatarInitials}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-text-primary truncate" title={displayName}>
            {displayName}
          </span>
          <span className="text-[10px] text-text-muted truncate">{userEmail || 'Sesión activa'}</span>
        </div>
      </div>

      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenPreferences}
          className={`p-1.5 rounded-md transition-colors ${
            isPreferencesActive ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-primary hover:bg-surface-3'
          }`}
          title="Mis preferencias"
          aria-label="Mis preferencias"
        >
          <SlidersHorizontal size={15} />
        </button>
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-surface-3 transition-colors"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={15} />
          </button>
        )}
      </div>
    </div>
  </div>
);
