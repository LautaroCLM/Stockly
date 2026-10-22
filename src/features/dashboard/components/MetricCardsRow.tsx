import React from 'react';
import { KpiCardData } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  AlertTriangle,
  CalendarDays,
} from 'lucide-react';

interface MetricCardsRowProps {
  kpis: {
    todaySales: KpiCardData;
    cashBalance: KpiCardData;
    itemsToRestock: KpiCardData;
    monthRevenue: KpiCardData;
  };
}

export const MetricCardsRow: React.FC<MetricCardsRowProps> = ({ kpis }) => {
  const cards = [
    {
      data: kpis.todaySales,
      icon: DollarSign,
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10',
    },
    {
      data: kpis.cashBalance,
      icon: Wallet,
      iconColor: 'text-accent',
      iconBg: 'bg-accent/10',
    },
    {
      data: kpis.itemsToRestock,
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-400/10',
    },
    {
      data: kpis.monthRevenue,
      icon: CalendarDays,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-400/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const isPositive = card.data.isPositive;

        return (
          <Card
            key={idx}
            hoverEffect
            className="p-4 flex flex-col justify-between relative overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-text-muted">
                  {card.data.title}
                </span>
                <div
                  className={`w-7 h-7 rounded-lg ${card.iconBg} flex items-center justify-center shrink-0`}
                >
                  <Icon size={15} className={card.iconColor} />
                </div>
              </div>

              <div className="text-2xl font-bold tracking-tight text-text-primary tabular-nums mb-1">
                {card.data.value}
              </div>
            </div>

            <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-1.5 truncate">
                <Badge
                  variant={
                    card.data.badgeColor === 'danger'
                      ? 'danger'
                      : card.data.badgeColor === 'warning'
                      ? 'warning'
                      : isPositive
                      ? 'success'
                      : 'neutral'
                  }
                  size="sm"
                  className="font-medium shrink-0"
                >
                  {isPositive ? (
                    <TrendingUp size={12} className="mr-1 inline" />
                  ) : (
                    <TrendingDown size={12} className="mr-1 inline" />
                  )}
                  {card.data.change}
                </Badge>
                <span className="text-[11px] text-text-muted truncate">
                  {card.data.trendLabel}
                </span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
