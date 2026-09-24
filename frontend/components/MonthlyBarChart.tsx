'use client';

import React, { useState } from 'react';
import { Card, Segmented, Spin, Table } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';

// Single series, so one hue (the Broadsheet accent) and no legend: the card title names it
const BAR_COLOR = '#0088b0'; // Broadsheet accent (cyan)
const GRID_COLOR = 'rgba(32, 30, 29, 0.08)'; // Broadsheet rule (ink 8%), visible on the card surface
const AXIS_TEXT_COLOR = 'rgba(32, 30, 29, 0.55)'; // Broadsheet muted ink

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
      <div style={{ color: AXIS_TEXT_COLOR, fontSize: 12 }}>{formatMonth(label)}</div>
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

  return (
    <Card
      title={title}
      extra={
        <Segmented
          size="small"
          value={view}
          onChange={(v) => setView(v as 'chart' | 'table')}
          options={[{ value: 'chart', label: 'Biểu đồ' }, { value: 'table', label: 'Bảng' }]}
        />
      }
    >
      {note}
      <Spin spinning={!!loading}>
        {view === 'chart' ? (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonth}
                  tick={{ fill: AXIS_TEXT_COLOR, fontSize: 12 }}
                  axisLine={{ stroke: GRID_COLOR }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: AXIS_TEXT_COLOR, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip content={<MonthlyTooltip unit={unit} />} cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }} />
                <Bar dataKey="value" name={valueLabel} fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Table
            size="small"
            pagination={false}
            rowKey="month"
            dataSource={data}
            columns={[
              { title: 'Tháng', dataIndex: 'month', key: 'month', render: formatMonth },
              { title: valueLabel, dataIndex: 'value', key: 'value', align: 'right' as const },
            ]}
          />
        )}
      </Spin>
    </Card>
  );
}
