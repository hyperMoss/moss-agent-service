import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {TextInput} from '@astryxdesign/core/TextInput';
import type {RuntimeConfigData} from '../types';

interface ModelSettingsModalProps {
  config: RuntimeConfigData;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}

export function ModelSettingsModal({
  config,
  onClose,
  onSave,
}: ModelSettingsModalProps) {
  const [provider, setProvider] = useState(config.model_provider);
  const [dashscopeModel, setDashscopeModel] = useState(config.dashscope_model);
  const [dashscopeKey, setDashscopeKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState(config.openai_model);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(config.openai_base_url);
  const [openaiKey, setOpenaiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        model_provider: provider,
        dashscope_model: dashscopeModel,
        openai_model: openaiModel,
        openai_base_url: openaiBaseUrl,
      };
      if (dashscopeKey.trim()) payload.dashscope_api_key = dashscopeKey.trim();
      if (openaiKey.trim()) payload.openai_api_key = openaiKey.trim();
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}>
      <div
        style={{
          width: 480,
          background: '#ffffff',
          borderRadius: 14,
          padding: 20,
          boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
        }}>
        <VStack gap={3}>
          <div style={{fontSize: 16, fontWeight: 700}}>
            AgentScope 2.0 模型与红线热配置
          </div>

          <div style={{fontSize: 12, color: 'var(--cs-muted)'}}>
            当前生效模式：{config.effective_provider}（AgentScope SDK 已安装：
            {config.agentscope_installed ? '是' : '否'}）
          </div>

          <div>
            <label style={{display: 'block', fontSize: 12, marginBottom: 4}}>
              模型提供商
            </label>
            <select
              className="cs-select"
              style={{width: '100%'}}
              value={provider}
              onChange={(e) =>
                setProvider(e.target.value as 'dashscope' | 'openai' | 'demo')
              }>
              <option value="dashscope">DashScope (阿里云百炼 / Qwen)</option>
              <option value="openai">OpenAI 兼容接口 (OpenAI / DeepSeek / vLLM)</option>
              <option value="demo">内置 SOP 演示模式 (无需 API Key)</option>
            </select>
          </div>

          {provider === 'dashscope' && (
            <VStack gap={2}>
              <TextInput
                label="DashScope 模型名"
                value={dashscopeModel}
                onChange={(val: string) => setDashscopeModel(val)}
              />
              <TextInput
                label="DASHSCOPE_API_KEY（留空则保持不变）"
                type="password"
                value={dashscopeKey}
                onChange={(val: string) => setDashscopeKey(val)}
              />
            </VStack>
          )}

          {provider === 'openai' && (
            <VStack gap={2}>
              <TextInput
                label="OpenAI Base URL"
                value={openaiBaseUrl}
                onChange={(val: string) => setOpenaiBaseUrl(val)}
              />
              <TextInput
                label="模型名称"
                value={openaiModel}
                onChange={(val: string) => setOpenaiModel(val)}
              />
              <TextInput
                label="OPENAI_API_KEY（留空则保持不变）"
                type="password"
                value={openaiKey}
                onChange={(val: string) => setOpenaiKey(val)}
              />
            </VStack>
          )}

          <div style={{fontSize: 12, color: 'var(--cs-muted)'}}>
            当前 SOP 折扣红线：页面尺寸 ≥ {(config.presales_page_min_discount * 10).toFixed(1)}折 ｜
            个人售后 ≥ {(config.aftersales_personal_min_discount * 10).toFixed(1)}折 ｜
            品质售后 ≥ {(config.aftersales_quality_min_discount * 10).toFixed(1)}折
          </div>

          <HStack gap={2}>
            <Button label="取消" onClick={onClose} />
            <Button
              label={saving ? '保存中...' : '保存并热生效'}
              onClick={handleSubmit}
            />
          </HStack>
        </VStack>
      </div>
    </div>
  );
}
