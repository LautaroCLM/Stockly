import React, { useState } from 'react';
import { RevenuePoint } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/formatters';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface RevenueAreaChartProps {
  data: {
    '7D': RevenuePoint[];
    '14D': RevenuePoint[];
    '30D': RevenuePoint[];
  };
}

export const RevenueAreaChart: React.FC<RevenueAreaChartProps> = ({ data }) => {
  const [period, setPeriod] = useState<'7D' | '14D' | '30D'>('14D');
  const chartData = data[period];

  const totalPeriod = chartData.reduce((acc, curr) => acc + curr.ventas, 0);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle>Evolución de Facturación y Ventas</CardTitle>
          <p className="text-xs text-text-muted mt-0.5">
            Total acumulado en el período: <strong className="text-text-primary">{formatCurrency(totalPeriod)}</strong>
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg border border-border shrink-0 self-start sm:self-auto">
          {(['7D', '14D', '30D'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                period === p
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
              }`}
            >
              {p === '7D' ? '7 Días' : p === '14D' ? '14 Días' : '30 Días'}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-4 pb-2">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="ventasGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2F6BFF" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2F6BFF" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="costoGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#27D3F5" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#27D3F5" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#162032"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                stroke="#475569"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#162032' }}
              />

              <YAxis
                stroke="#475569"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />

              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const venta = payload[0].value as number;
                    const costo = payload[1]?.value as number;
                    return (
                      <div className="bg-surface border border-border-active p-3 rounded-lg shadow-xl shadow-black/80">
                        <div className="text-xs font-semibold text-text-primary mb-1.5 pb-1 border-b border-border">
                          {label}
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-text-secondary">
                              <span className="w-2 h-2 rounded-full bg-primary" />
                              Ventas:
                            </span>
                            <span className="font-semibold text-text-primary tabular-nums">
                              {formatCurrency(venta)}
                            </span>
                          </div>
                          {costo !== undefined && (
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-text-muted">
                                <span className="w-2 h-2 rounded-full bg-accent" />
                                Costo Reposición:
                              </span>
                              <span className="font-semibold text-text-muted tabular-nums">
                                {formatCurrency(costo)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              <Area
                type="monotone"
                dataKey="ventas"
                stroke="#2F6BFF"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#ventasGradient)"
                name="Ventas"
              />
              <Area
                type="monotone"
                dataKey="costo"
                stroke="#27D3F5"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill="url(#costoGradient)"
                name="Costo Reposición"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
