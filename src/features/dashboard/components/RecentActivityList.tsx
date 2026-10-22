import React from 'react';
import { ActivityEvent } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/formatters';
import {
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Clock,
} from 'lucide-react';

interface RecentActivityListProps {
  activities: ActivityEvent[];
  onViewAllClick: () => void;
}

export const RecentActivityList: React.FC<RecentActivityListProps> = ({
  activities,
  onViewAllClick,
}) => {
  const getEventIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'sale':
        return <ShoppingBag size={14} className="text-emerald-400" />;
      case 'purchase':
        return <ArrowDownLeft size={14} className="text-primary" />;
      case 'stock_in':
        return <ArrowDownLeft size={14} className="text-cyan-400" />;
      case 'stock_out':
        return <ArrowUpRight size={14} className="text-amber-400" />;
      case 'cash':
        return <Wallet size={14} className="text-purple-400" />;
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-text-muted" />
          <CardTitle>Últimos Movimientos</CardTitle>
        </div>
        <button
          onClick={onViewAllClick}
          className="text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
        >
          Ver todo
        </button>
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y divide-border/60">
          {activities.map((event) => (
            <div
              key={event.id}
              className="p-3.5 px-4 flex items-center justify-between gap-3 hover:bg-surface-2/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  {getEventIcon(event.type)}
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-text-primary truncate">
                    {event.description}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-text-muted truncate">
                    <span>{event.entity}</span>
                    <span>•</span>
                    <span>{event.timeAgo}</span>
                  </div>
                </div>
              </div>

              {event.amount !== undefined && (
                <div className="text-right shrink-0">
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      event.amount >= 0 ? 'text-emerald-400' : 'text-danger'
                    }`}
                  >
                    {event.amount >= 0 ? '+' : ''}
                    {formatCurrency(event.amount)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
