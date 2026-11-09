import React from 'react';
import { RouteId, NavSection } from '@/types';
import { Badge } from '@/components/ui/Badge';
import {
  LucideIcon,
  LayoutDashboard,
  Boxes,
  Receipt,
  Wallet,
  ShoppingCart,
  Truck,
  Users,
  BarChart3,
  UserCheck,
  Clock,
  History,
  Building2,
  ShieldCheck,
  ScrollText,
  ReceiptText,
  ArrowLeftRight,
  FileBarChart,
  Tractor,
  X,
  LogOut,
} from 'lucide-react';

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

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Boxes,
  Receipt,
  Wallet,
  ShoppingCart,
  Truck,
  Users,
  BarChart3,
  UserCheck,
  History,
  Building2,
  ShieldCheck,
  ScrollText,
  ReceiptText,
  ArrowLeftRight,
  FileBarChart,
  Tractor,
  Clock,
};

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
          {sections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              <div className="px-3 pb-1.5 text-[10px] font-semibold tracking-wider uppercase text-text-muted/80">
                {section.title}
              </div>
              {section.items.map((item) => {
                const isActive = activeRoute === item.id;
                const IconComponent = ICON_MAP[item.iconName] || Boxes;

                return (
                  <button
                    key={item.id}
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
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer profile & system status */}
        <div className="p-3 border-t border-border shrink-0 bg-surface/50">
          <div className="flex items-center justify-between p-2 rounded-lg bg-surface-2/60 border border-border/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary/30 to-surface-3 border border-border flex items-center justify-center text-xs font-bold text-text-primary shrink-0">
                {avatarInitials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-text-primary truncate" title={displayName}>
                  {displayName}
                </span>
                <span className="text-[10px] text-text-muted truncate">
                  {userEmail || 'Sesión activa'}
                </span>
              </div>
            </div>
            {onSignOut ? (
              <button
                onClick={onSignOut}
                className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-surface-3 transition-colors shrink-0"
                title="Cerrar sesión"
              >
                <LogOut size={15} />
              </button>
            ) : (
              <div className="flex items-center gap-1 shrink-0" title="Sistema en línea">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
