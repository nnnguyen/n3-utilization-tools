'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  ColorPicker,
  Divider,
  InputNumber,
  Radio,
  Select,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import { API_BASE_URL, API_URL, apiFetch } from '@/lib/api';
import { authHeaders } from '@/lib/auth-token';
import { CloseOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import { TEXT_COLOR_SCHEME_OPTIONS } from '@/app/word-cloud/lib/text-color-schemes';
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_TEXT_COLOR_SCHEME,
  type Question,
  type QuestionPatch,
} from '@/app/word-cloud/types/question';
import { useT, useFormat } from '@/lib/i18n';

const { Text, Link } = Typography;

export type ApplyToAllGroup = 'joining' | 'showResponses';

export interface SaveStatus {
  status: 'idle' | 'saving' | 'saved';
  lastSavedAt: Date | null;
}

interface QuestionEditPanelProps {
  question: Question;
  questions: Question[];
  saveStatus: SaveStatus;
  onFieldChange: (questionId: string, patch: QuestionPatch) => void;
  onApplyToAll: (group: ApplyToAllGroup) => void;
  onClose: () => void;
}

function GroupHeader({ title, onApplyToAll }: { title: string; onApplyToAll?: () => void }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text strong>{title}</Text>
      {onApplyToAll && (
        <Link onClick={onApplyToAll} style={{ fontSize: 12 }}>
          {t('wcq.applyToAllLink')}
        </Link>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 13 }}>{label}</Text>
      {children}
    </div>
  );
}

export function QuestionEditPanel({
  question,
  questions,
  saveStatus,
  onFieldChange,
  onApplyToAll,
  onClose,
}: QuestionEditPanelProps) {
  const t = useT();
  const fmt = useFormat();
  const [uploading, setUploading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [applyToAll, setApplyToAllLocal] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  const questionId = question.id;
  const change = (patch: QuestionPatch) => {
    onFieldChange(questionId, patch);
    setHasChanges(true);
  };

  useEffect(() => {
    setHasChanges(false);
  }, [question.id]);

  const saveStatusText =
    saveStatus.status === 'saving'
      ? t('wcq.saving')
      : saveStatus.lastSavedAt
        ? t('wcq.savedAt', { time: fmt.time(saveStatus.lastSavedAt) })
        : '';

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong style={{ fontSize: 16 }}>
            {t('wcq.edit')}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {saveStatusText}
            </Text>
          </div>
        </div>
        <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <div>
        <Text strong>{t('wcq.question')}</Text>
        <div style={{ marginTop: 8 }}>
          <Select disabled value="WORD_CLOUD" style={{ width: '100%' }} options={[{ value: 'WORD_CLOUD', label: 'Word Cloud' }]} />
        </div>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Text strong>{t('wcq.responseSettings')}</Text>
        <Row label={t('wcq.limitResponses')}>
          <Switch
            checked={question.responseLimit !== null}
            onChange={(checked) => change({ responseLimit: checked ? 3 : null })}
          />
        </Row>
        {question.responseLimit !== null && (
          <Row label={t('wcq.maxResponses')}>
            <InputNumber
              min={1}
              value={question.responseLimit}
              onChange={(value) => change({ responseLimit: value ?? 1 })}
            />
          </Row>
        )}
        <Row label={t('wcq.maxWordLength')}>
          <InputNumber
            min={1}
            value={question.maxWordLength}
            onChange={(value) => change({ maxWordLength: value ?? 1 })}
          />
        </Row>
        <Row label={t('wcq.allowDuplicate')}>
          <Switch
            checked={question.allowDuplicateFromSameUser}
            onChange={(checked) => change({ allowDuplicateFromSameUser: checked })}
          />
        </Row>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Text strong>{t('wcq.design')}</Text>
        <Tooltip title={t('wcq.comingSoon')}>
          <Row label={t('wcq.contentImage')}>
            <Switch disabled />
          </Row>
        </Tooltip>
        <Tooltip title={t('wcq.comingSoon')}>
          <Row label={t('wcq.backgroundImage')}>
            <Switch disabled />
          </Row>
        </Tooltip>
        <Row label={t('wcq.backgroundColor')}>
          <ColorPicker
            value={question.backgroundColor}
            onChange={(color) => change({ backgroundColor: color.toHexString() })}
          />
        </Row>
        <Row label={t('wcq.questionColor')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ColorPicker
              value={question.questionColor || '#000000'}
              disabled={!question.questionColor}
              onChange={(color) => change({ questionColor: color.toHexString() })}
            />
            <Switch
              size="small"
              checked={!!question.questionColor}
              onChange={(checked) => change({ questionColor: checked ? '#000000' : null })}
            />
            <Text style={{ fontSize: 12 }}>{question.questionColor ? t('wcq.custom') : t('wcq.auto')}</Text>
          </div>
        </Row>
        <Row label={t('wcq.textPalette')}>
          <Select
            value={question.textColorScheme}
            options={TEXT_COLOR_SCHEME_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
            style={{ width: 140 }}
            onChange={(value) => change({ textColorScheme: value })}
          />
        </Row>
        <Row label={t('wcq.showLogo')}>
          <Switch checked={question.showLogo} onChange={(checked) => change({ showLogo: checked })} />
        </Row>
        {question.showLogo && (
          <Row label={t('wcq.logo')}>
            <Upload
              name="file"
              listType="picture-card"
              className="avatar-uploader"
              showUploadList={false}
              action={`${API_URL}/questions/upload-logo`}
              withCredentials={true}
              headers={authHeaders()}
              beforeUpload={(file) => {
                const isLt2M = file.size / 1024 / 1024 < 2;
                if (!isLt2M) {
                  message.error(t('wcq.imageTooLarge'));
                }
                return isLt2M;
              }}
              onChange={(info) => {
                if (info.file.status === 'uploading') {
                  setUploading(true);
                  return;
                }
                if (info.file.status === 'done') {
                  setUploading(false);
                  const url = info.file.response?.url;
                  if (url) {
                    change({ logoUrl: url });
                  } else {
                    message.error(t('wcq.noImageUrl'));
                  }
                } else if (info.file.status === 'error') {
                  setUploading(false);
                  message.error(t('wcq.logoUploadFailed'));
                }
              }}
            >
              {question.logoUrl ? (
                <img
                  src={`${API_BASE_URL}${question.logoUrl}`}
                  alt="logo"
                  style={{ width: '100%' }}
                />
              ) : (
                <div>
                  {uploading ? <LoadingOutlined /> : <PlusOutlined />}
                  <div style={{ marginTop: 8 }}>{t('wcq.upload')}</div>
                </div>
              )}
            </Upload>
          </Row>
        )}
        <Row label={t('wcq.maxWordsDisplayed')}>
          <InputNumber
            min={1}
            value={question.maxWordsDisplayed}
            onChange={(value) => change({ maxWordsDisplayed: value ?? 1 })}
          />
        </Row>
        <Link
          style={{ fontSize: 12 }}
          onClick={() =>
            change({
              backgroundColor: DEFAULT_BACKGROUND_COLOR,
              textColorScheme: DEFAULT_TEXT_COLOR_SCHEME,
            })
          }
        >
          {t('wcq.resetColors')}
        </Link>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GroupHeader title={t('wcq.joiningInstructions')} onApplyToAll={() => onApplyToAll('joining')} />
        <Row label={t('wcq.showJoiningInfo')}>
          <Switch
            checked={question.showJoiningInfo}
            onChange={(checked) => change({ showJoiningInfo: checked })}
          />
        </Row>
        <Row label={t('wcq.displayType')}>
          <Select
            value={question.joiningInfoType}
            style={{ width: 140 }}
            options={[
              { value: 'QR_CODE', label: t('wcq.typeQr') },
              { value: 'LINK', label: t('wcq.typeLink') },
              { value: 'CODE', label: t('wcq.typeCode') },
            ]}
            onChange={(value) => change({ joiningInfoType: value })}
          />
        </Row>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GroupHeader title={t('wcq.showResponses')} onApplyToAll={() => onApplyToAll('showResponses')} />
        <Radio.Group
          value={question.resultVisibility}
          onChange={(e) => change({ resultVisibility: e.target.value })}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Radio value="INSTANT">{t('wcq.showInstant')}</Radio>
            <Radio value="ON_CLICK">
              {t('wcq.showOnClick')} <Tag color="blue">{t('wcq.recommended')}</Tag>
            </Radio>
            <Radio value="PRIVATE">{t('wcq.showNever')}</Radio>
          </div>
        </Radio.Group>
      </div>

      <Divider style={{ margin: 0 }} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          opacity: hasChanges ? 1 : 0.5,
          pointerEvents: hasChanges ? 'auto' : 'none',
        }}
      >
        <Text strong>{t('wcq.applyAboveTo')}</Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Checkbox
            checked={applyToAll}
            onChange={(e) => {
              setApplyToAllLocal(e.target.checked);
              if (e.target.checked) setTargetIds([]);
            }}
          >
            {t('wcq.allQuestions')}
          </Checkbox>
          <Select
            mode="multiple"
            placeholder={t('wc.selectQuestion')}
            style={{ width: '100%' }}
            disabled={applyToAll}
            value={targetIds}
            onChange={setTargetIds}
            options={questions
              .filter((q) => q.id !== questionId)
              .map((q) => ({
                label: t('wcq.questionLabel', { n: q.order, prompt: q.prompt || t('wcq.empty') }),
                value: q.id,
              }))}
          />
          <Button
            type="primary"
            disabled={!applyToAll && targetIds.length === 0}
            loading={applying}
            onClick={async () => {
              setApplying(true);
              try {
                await apiFetch(`/questions/${questionId}/apply-settings-to-others`, {
                  method: 'POST',
                  body: JSON.stringify({
                    applyToAll,
                    targetQuestionIds: targetIds,
                  }),
                });
                message.success(t('wcq.appliedToOthers'));
                setHasChanges(false);
              } catch (error) {
                message.error(t('wcq.applyConfigFailed'));
              } finally {
                setApplying(false);
              }
            }}
          >
            {t('wcq.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}
