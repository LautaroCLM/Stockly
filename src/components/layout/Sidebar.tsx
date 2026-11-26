import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { RouteId, NavSection } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Boxes, X } from 'lucide-react';
import { NAV_ICONS } from './navIcons';
import { SidebarUserCard } from './SidebarUserCard';

interface SidebarProps {
  sections: NavSection[];
  activeRoute: RouteId;
  onNavigate: (routeId: RouteId) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  userName?: string;
  userEmail?: string;
  onSignOut?: () => void;
}


/** Al ocultar o mostrar un módulo desde Mis preferencias, la fila se pliega o despliega en vez de saltar. */
const COLLAPSE = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  style: { overflow: 'hidden' },
} as const;

export const Sidebar: React.FC<SidebarProps> = ({
  sections,
  activeRoute,
  onNavigate,
  isOpenMobile,
  onCloseMobile,
  userName,
  userEmail,
  onSignOut,
}) => {
  const displayName = userName || (userEmail ? userEmail.split('@')[0] : 'Usuario');
  const avatarInitials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'US';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-surface border-r border-border flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="h-16 px-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/stockly.png"
              alt="Logo de Stockly"
              className="w-8 h-8 rounded-lg object-contain shadow-md shadow-primary/20 shrink-0"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-brand font-bold text-lg tracking-tight text-text-primary">
                  Stockly
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              </div>
              <span className="text-[10px] text-text-muted font-mono tracking-wider uppercase">
                Enterprise SaaS
              </span>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="lg:hidden text-text-muted hover:text-text-primary p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <AnimatePresence initial={false}>
          {sections.map((section) => (
            <m.div key={section.title} className="space-y-1" {...COLLAPSE}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold tracking-wider uppercase text-text-muted/80">
                {section.title}
              </div>
              <AnimatePresence initial={false}>
              {section.items.map((item) => {
                const isActive = activeRoute === item.id;
                const IconComponent = NAV_ICONS[item.iconName] || Boxes;

                return (
                  <m.div key={item.id} {...COLLAPSE}>
                  <button
                    onClick={() => {
                      onNavigate(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
                      isActive
                        ? 'bg-primary/10 text-primary-light font-semibold border-l-2 border-primary shadow-sm'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <IconComponent
                        size={16}
                        className={`transition-colors shrink-0 ${
                          isActive
                            ? 'text-primary'
                            : 'text-text-muted group-hover:text-text-secondary'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge && (
                      <Badge
                        variant={item.badgeVariant || 'neutral'}
                        size="sm"
                        className="text-[10px] px-1.5 py-0 shrink-0"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </button>
                  </m.div>
                );
              })}
              </AnimatePresence>
            </m.div>
          ))}
          </AnimatePresence>
        </div>

        <SidebarUserCard
          displayName={displayName}
          avatarInitials={avatarInitials}
          userEmail={userEmail}
          isPreferencesActive={activeRoute === 'mis-preferencias'}
          onOpenPreferences={() => {
            onNavigate('mis-preferencias');
            onCloseMobile();
          }}
          onSignOut={onSignOut}
        />
      </aside>
    </>
  );
};
