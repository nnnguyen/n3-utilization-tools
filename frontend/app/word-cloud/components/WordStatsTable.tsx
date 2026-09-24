'use client';

import { Button, Table } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { WordCloudWord } from './WordCloud';
import { useT } from '@/lib/i18n';

interface WordStatsTableProps {
  words: WordCloudWord[];
  totalResponses: number;
  filename: string;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(words: WordCloudWord[], filename: string, header: [string, string]) {
  const rows = [header, ...words.map((w) => [w.displayText, String(w.count)])];
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  // Prepend a UTF-8 BOM so Excel opens Vietnamese text correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function WordStatsTable({ words, totalResponses, filename }: WordStatsTableProps) {
  const t = useT();
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          disabled={words.length === 0}
          onClick={() => downloadCsv(words, filename, [t('wcq.word'), t('wcq.count')])}
        >
          {t('wcq.exportCsv')}
        </Button>
      </div>
      <Table
        size="small"
        rowKey={(_, index) => index ?? 0}
        dataSource={words}
        pagination={false}
        locale={{ emptyText: t('wc.noResponses') }}
        columns={[
          { title: t('wcq.word'), dataIndex: 'displayText' },
          {
            title: t('wcq.count'),
            dataIndex: 'count',
            sorter: (a: WordCloudWord, b: WordCloudWord) => a.count - b.count,
            defaultSortOrder: 'descend',
          },
          {
            title: t('wcq.percent'),
            key: 'percent',
            render: (_, record: WordCloudWord) =>
              totalResponses > 0 ? `${((record.count / totalResponses) * 100).toFixed(1)}%` : '0%',
          },
        ]}
      />
    </div>
  );
}
