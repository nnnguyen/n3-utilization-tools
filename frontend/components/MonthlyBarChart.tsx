'use client';

import React, { useState } from 'react';
import { Card, Segmented, Spin, Table } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';

import { usePreferences } from '@/lib/preferences';
import { useT } from '@/lib/i18n';
import { chartAccent } from '@/lib/theme';

// SVG attributes can't read CSS variables, so the chart picks its colors from
// the active theme here. Single series: one hue (the theme accent), no legend
// (the card title names it); rules and axis text in the theme's muted ink.
function useChartColors() {
  const { themeStyle, resolvedMode } = usePreferences();
  const dark = resolvedMode === 'dark';
  return {
    bar: chartAccent(themeStyle, resolvedMode),
    grid: dark ? 'rgba(236, 232, 230, 0.09)' : 'rgba(32, 30, 29, 0.08)',
    axisText: dark ? 'rgba(236, 232, 230, 0.6)' : 'rgba(32, 30, 29, 0.55)',
  };
}

export interface MonthlyPoint {
  month: string; // "YYYY-MM"
  value: number;
}

// "2026-09" -> "09/2026"
export const formatMonth = (month: string) => {
  const [y, m] = month.split('-');
  return `${m}/${y}`;
};

function MonthlyTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 6, padding: '8px 12px', boxShadow: '0 3px 6px rgba(0,0,0,0.08)' }}>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{formatMonth(label)}</div>
      <div style={{ fontWeight: 600 }}>{payload[0].value} {unit}</div>
    </div>
  );
}

interface MonthlyBarChartProps {
  title: string;
  data: MonthlyPoint[];
  // Header of the value column in table view, e.g. "Video sync thành công"
  valueLabel: string;
  // Word after the number in the tooltip, e.g. "video"
  unit?: string;
  loading?: boolean;
  // Optional note under the title (e.g. what is counted)
  note?: React.ReactNode;
}

// Monthly bar chart with a Chart/Table toggle (Dashboard, Analytics)
export default function MonthlyBarChart({ title, data, valueLabel, unit = 'video', loading, note }: MonthlyBarChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const t = useT();
  const colors = useChartColors();

  return (
    <Card
      title={title}
      extra={
        <Segmented
          size="small"
          value={view}
          onChange={(v) => setView(v as 'chart' | 'table')}
          options={[{ value: 'chart', label: t('chart.viewChart') }, { value: 'table', label: t('chart.viewTable') }]}
        />
      }
    >
      {note}
      <Spin spinning={!!loading}>
        {view === 'chart' ? (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={colors.grid} />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonth}
                  tick={{ fill: colors.axisText, fontSize: 12 }}
                  axisLine={{ stroke: colors.grid }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: colors.axisText, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip content={<MonthlyTooltip unit={unit} />} cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }} />
                <Bar dataKey="value" name={valueLabel} fill={colors.bar} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Table
            scroll={{ x: 'max-content' }}
            size="small"
            pagination={false}
            rowKey="month"
            dataSource={data}
            columns={[
              { title: t('chart.month'), dataIndex: 'month', key: 'month', render: formatMonth },
              { title: valueLabel, dataIndex: 'value', key: 'value', align: 'right' as const },
            ]}
          />
        )}
      </Spin>
    </Card>
  );
}
