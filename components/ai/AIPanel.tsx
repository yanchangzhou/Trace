'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  GitCompare,
  ListTodo,
  MessageSquare,
  Send,
  Sparkles,
  Copy,
  ChevronDown,
  Check,
  Palette,
  BookOpen,
  Microscope,
  Zap,
  User,
  Key,
  Eye,
  EyeOff,
  AlertCircle,
  MessageCircle,
  Mail,
  GraduationCap,
  Settings,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorContext } from '@/contexts/EditorContext';
import { useBook } from '@/contexts/BookContext';
import type { AIMessage, WritingStyle, StyleProfile, AIRequest, SavedStyleProfile } from '@/types';
import StreamingComposer from './StreamingComposer';
import {
  streamGenerate, saveApiKey, getApiKey, getStyleProfile, isTauriEnvironment,
  listSavedStyleProfiles, saveModelSettings, getModelSettings,
} from '@/lib/tauri';

const springConfig = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

const STYLE_OPTIONS: {
  key: WritingStyle;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  { key: 'default', label: 'Default', icon: Sparkles, description: 'Balanced and helpful' },
  { key: 'academic', label: 'Academic', icon: BookOpen, description: 'Formal, precise, well-structured' },
  { key: 'analytical', label: 'Analytical', icon: Microscope, description: 'Data-driven and objective' },
  { key: 'concise', label: 'Concise', icon: Zap, description: 'Brief and to the point' },
  { key: 'my_style', label: 'My Style', icon: User, description: 'Based on your writing patterns' },
];

const ACTIONS = [
  { key: 'summarize', label: 'Summarize', description: 'Summarize selected documents', icon: FileText },
  { key: 'compare', label: 'Compare', description: 'Compare two documents', icon: GitCompare },
  { key: 'outline', label: 'Outline', description: 'Generate writing outline', icon: ListTodo },
  { key: 'free', label: 'Chat', description: 'Free-form AI chat', icon: MessageSquare },
] as const;

const TASK_TYPES = [
  { key: '', label: 'Basic', icon: MessageCircle, description: 'Standard AI actions' },
  { key: 'wechat_article', label: '公众号', icon: FileText, description: 'WeChat article' },
  { key: 'long_email', label: '长邮件', icon: Mail, description: 'Long-form email' },
  { key: 'course_paper', label: '课程论文', icon: GraduationCap, description: 'Course paper' },
] as const;

export default function AIPanel() {
  const { isAIPanelOpen, setAIPanelOpen, insertGeneratedText, replaceSelection } = useEditorContext();
  const { currentFiles } = useBook();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [activeAction, setActiveAction] = useState<string>('free');
  const [activeTaskType, setActiveTaskType] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<WritingStyle>('default');
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [savedStyleProfiles, setSavedStyleProfiles] = useState<SavedStyleProfile[]>([]);
  const [selectedSavedStyleProfileId, setSelectedSavedStyleProfileId] = useState('');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showStyleConstraints, setShowStyleConstraints] = useState(false);

  // Writing task fields
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [length, setLength] = useState('');
  const [language, setLanguage] = useState('');
  const [outputMode, setOutputMode] = useState('draft');

  // API key management
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [showApiKeyText, setShowApiKeyText] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [isTauri, setIsTauri] = useState(false);

  // Model settings
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [modelProvider, setModelProvider] = useState('openai');
  const [modelName, setModelName] = useState('gpt-4o-mini');
  const [modelBaseUrl, setModelBaseUrl] = useState('https://api.openai.com/v1/chat/completions');
  const [modelSaving, setModelSaving] = useState(false);

  const cancelStreamRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsTauri(isTauriEnvironment());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuffer]);

  // Load saved API key and model settings on open
  useEffect(() => {
    if (!isAIPanelOpen || !isTauri) return;
    getApiKey().then((k) => {
      if (k) setSavedApiKey(k);
    });
    listSavedStyleProfiles().then(setSavedStyleProfiles).catch(() => setSavedStyleProfiles([]));
    getModelSettings().then((settings) => {
      if (settings) {
        if (settings.provider) setModelProvider(settings.provider);
        if (settings.model_name) setModelName(settings.model_name);
        if (settings.base_url) setModelBaseUrl(settings.base_url);
      }
    }).catch(() => {});
  }, [isAIPanelOpen, isTauri]);

  const currentStyle = STYLE_OPTIONS.find((s) => s.key === selectedStyle) ?? STYLE_OPTIONS[0];
  const StyleIcon = currentStyle.icon;

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    setApiKeySaving(true);
    try {
      await saveApiKey(apiKey.trim());
      setSavedApiKey(apiKey.trim());
      setApiKey('');
      setShowApiKeyInput(false);
    } catch (error) {
      console.error('Failed to save API key:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to save API key'}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setApiKeySaving(false);
    }
  }, [apiKey]);

  const handleSaveModelSettings = useCallback(async () => {
    if (!isTauri) return;
    setModelSaving(true);
    try {
      await saveModelSettings(modelProvider, modelName, modelBaseUrl);
      setShowModelSettings(false);
    } catch (error) {
      console.error('Failed to save model settings:', error);
    } finally {
      setModelSaving(false);
    }
  }, [isTauri, modelProvider, modelName, modelBaseUrl]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    // Browser fallback: show a message explaining Tauri is required
    if (!isTauri) {
      const demoMsg: AIMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content:
          'AI generation requires the desktop app. Run `npm run tauri dev` and set your OpenAI API key in the AI panel settings.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [
        ...prev,
        { id: `msg-${Date.now() - 1}`, role: 'user', content: text, timestamp: Date.now() - 1 },
        demoMsg,
      ]);
      setInputText('');
      return;
    }

    if (!savedApiKey) {
      setShowApiKeyInput(true);
      return;
    }

    const userMessage: AIMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsStreaming(true);
    setStreamBuffer('');

    const contextFileIds = currentFiles
      .filter((f) => f.id && f.id !== f.path)
      .map((f) => f.id);

    const request: AIRequest = {
      action: activeAction as AIRequest['action'],
      context_file_ids: contextFileIds,
      style: selectedStyle,
      style_profile_id: selectedSavedStyleProfileId || undefined,
      prompt: text,
      task_type: activeTaskType || undefined,
      audience: audience || undefined,
      goal: goal || undefined,
      length: length || undefined,
      language: language || undefined,
      output_mode: outputMode || undefined,
    };

    let accumulated = '';

    const cancel = await streamGenerate(
      request,
      (token) => {
        accumulated += token;
        setStreamBuffer(accumulated);
      },
      () => {
        const assistantMessage: AIMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: accumulated,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamBuffer('');
        setIsStreaming(false);
        cancelStreamRef.current = null;
      },
      (errorMsg) => {
        const errorMessage: AIMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${errorMsg}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setStreamBuffer('');
        setIsStreaming(false);
        cancelStreamRef.current = null;
      },
    );

    cancelStreamRef.current = cancel;
  }, [inputText, isStreaming, isTauri, savedApiKey, currentFiles, activeAction, selectedStyle, selectedSavedStyleProfileId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleCancelStream = () => {
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
    setIsStreaming(false);
    setStreamBuffer('');
  };

  const clearChat = () => {
    if (isStreaming) handleCancelStream();
    setMessages([]);
    setStreamBuffer('');
  };

  const copyLastResponse = () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant) {
      void navigator.clipboard.writeText(lastAssistant.content);
    }
  };

  const handleSelectStyle = useCallback(async (key: WritingStyle) => {
    setSelectedStyle(key);
    setShowStyleMenu(false);
    if (key === 'my_style' && isTauri) {
      const profile = await getStyleProfile('my_style');
      if (profile) {
        setStyleProfile(profile);
        setShowStyleConstraints(true);
      }
    } else {
      setShowStyleConstraints(false);
    }
  }, [isTauri]);

  return (
    <AnimatePresence>
      {isAIPanelOpen && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={springConfig}
          className="fixed right-0 top-12 bottom-0 w-[420px] bg-surface-light dark:bg-surface-dark border-l border-border-light dark:border-border-dark z-40 flex flex-col shadow-ambient-lg dark:shadow-ambient-lg-dark"
        >
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-border-light dark:border-border-dark flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent-warm" />
              <h2 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark tracking-tight">
                AI Assistant
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowModelSettings((v) => !v)}
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center"
                title="Model settings"
              >
                <Settings className="w-4 h-4 text-text-tertiary-light dark:text-text-tertiary-dark" />
              </button>
              <button
                onClick={() => setShowApiKeyInput((v) => !v)}
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center"
                title={savedApiKey ? 'API key configured' : 'Set API key'}
              >
                <Key className={`w-4 h-4 ${savedApiKey ? 'text-green-500' : 'text-text-tertiary-light dark:text-text-tertiary-dark'}`} />
              </button>
              <button
                onClick={() => setAIPanelOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center"
              >
                <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
              </button>
            </div>
          </div>

          {/* API Key Setup */}
          <AnimatePresence>
            {showApiKeyInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-border-light dark:border-border-dark overflow-hidden flex-shrink-0"
              >
                <div className="p-4 space-y-2">
                  <p className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark">
                    OpenAI API Key
                  </p>
                  {!savedApiKey && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 rounded-lg px-2.5 py-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Required for AI generation</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showApiKeyText ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={savedApiKey ? 'Enter new key to replace…' : 'sk-…'}
                        className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2 text-sm text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50 pr-8"
                        onKeyDown={(e) => e.key === 'Enter' && void handleSaveApiKey()}
                      />
                      <button
                        onClick={() => setShowApiKeyText((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary-light dark:text-text-tertiary-dark"
                      >
                        {showApiKeyText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      onClick={() => void handleSaveApiKey()}
                      disabled={!apiKey.trim() || apiKeySaving}
                      className="px-3 py-2 bg-accent-warm text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-accent-warm/90 transition-colors"
                    >
                      {apiKeySaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {savedApiKey && (
                    <p className="text-xs text-green-500 flex items-center gap-1">
                      <Check className="w-3 h-3" /> API key is configured
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Model Settings */}
          <AnimatePresence>
            {showModelSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-border-light dark:border-border-dark overflow-hidden flex-shrink-0"
              >
                <div className="p-4 space-y-2">
                  <p className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark">
                    Model Settings
                  </p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
                        Provider
                      </label>
                      <select
                        value={modelProvider}
                        onChange={(e) => {
                          setModelProvider(e.target.value);
                          if (e.target.value === 'openai') {
                            setModelBaseUrl('https://api.openai.com/v1/chat/completions');
                            setModelName('gpt-4o-mini');
                          } else if (e.target.value === 'deepseek') {
                            setModelBaseUrl('https://api.deepseek.com/v1/chat/completions');
                            setModelName('deepseek-chat');
                          } else if (e.target.value === 'zhipu') {
                            setModelBaseUrl('https://open.bigmodel.cn/api/paas/v4/chat/completions');
                            setModelName('glm-4-flash');
                          } else if (e.target.value === 'qwen') {
                            setModelBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
                            setModelName('qwen-turbo');
                          }
                        }}
                        className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded px-2 py-1.5 text-xs text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="zhipu">Zhipu (智谱)</option>
                        <option value="qwen">Qwen (通义千问)</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
                        Model Name
                      </label>
                      <input
                        type="text"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        placeholder="gpt-4o-mini"
                        className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded px-2 py-1.5 text-xs text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
                        API Base URL
                      </label>
                      <input
                        type="text"
                        value={modelBaseUrl}
                        onChange={(e) => setModelBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1/chat/completions"
                        className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded px-2 py-1.5 text-xs text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50"
                      />
                    </div>
                    <button
                      onClick={() => void handleSaveModelSettings()}
                      disabled={modelSaving}
                      className="w-full px-3 py-1.5 bg-accent-warm text-white rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-accent-warm/90 transition-colors"
                    >
                      {modelSaving ? 'Saving…' : 'Save Settings'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Selector */}
          <div className="flex border-b border-border-light dark:border-border-dark flex-shrink-0">
            {ACTIONS.map((action) => (
              <button
                key={action.key}
                onClick={() => setActiveAction(action.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  activeAction === action.key
                    ? 'text-accent-warm border-b-2 border-accent-warm'
                    : 'text-text-tertiary-light dark:text-text-tertiary-dark hover:text-text-secondary-light dark:hover:text-text-secondary-dark'
                }`}
              >
                <action.icon className="w-3.5 h-3.5" />
                {action.label}
              </button>
            ))}
          </div>

          {/* Task Type Selector */}
          <div className="flex border-b border-border-light dark:border-border-dark flex-shrink-0 px-2 gap-1 overflow-x-auto">
            {TASK_TYPES.map((task) => (
              <button
                key={task.key}
                onClick={() => setActiveTaskType(task.key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap my-1 ${
                  activeTaskType === task.key
                    ? 'bg-accent-warm/10 text-accent-warm'
                    : 'text-text-tertiary-light dark:text-text-tertiary-dark hover:bg-background-light dark:hover:bg-background-dark'
                }`}
                title={task.description}
              >
                <task.icon className="w-3 h-3" />
                {task.label}
              </button>
            ))}
          </div>

          {/* Task-specific fields */}
          <AnimatePresence>
            {activeTaskType && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-border-light dark:border-border-dark overflow-hidden flex-shrink-0"
              >
                <div className="p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
                        Audience
                      </label>
                      <input
                        type="text"
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        placeholder="e.g. professor, readers"
                        className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded px-2 py-1 text-xs text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
                        Language
                      </label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded px-2 py-1 text-xs text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50"
                      >
                        <option value="">Auto</option>
                        <option value="zh-CN">Chinese</option>
                        <option value="en-US">English</option>
                        <option value="bilingual">Bilingual</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
                        Length
                      </label>
                      <input
                        type="text"
                        value={length}
                        onChange={(e) => setLength(e.target.value)}
                        placeholder="e.g. ~800 words"
                        className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded px-2 py-1 text-xs text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
                        Output
                      </label>
                      <select
                        value={outputMode}
                        onChange={(e) => setOutputMode(e.target.value)}
                        className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded px-2 py-1 text-xs text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50"
                      >
                        <option value="draft">Draft</option>
                        <option value="outline">Outline</option>
                        <option value="rewrite">Rewrite</option>
                        <option value="polish">Polish</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
                      Goal
                    </label>
                    <input
                      type="text"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="What should this writing achieve?"
                      className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded px-2 py-1 text-xs text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages Area */}
          <StreamingComposer
            messages={messages}
            isStreaming={isStreaming}
            streamBuffer={streamBuffer}
            onRetry={undefined}
            onInsert={(text) => insertGeneratedText(text)}
            onReplace={(text) => replaceSelection(text)}
          />
          <div ref={messagesEndRef} />

          {/* Style Constraints Display */}
          <AnimatePresence>
            {showStyleConstraints && styleProfile && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-border-light dark:border-border-dark px-4 py-3 overflow-hidden"
              >
                <p className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-2">
                  Active Style Constraints
                </p>
                <div className="space-y-1">
                  {styleProfile.constraints.map((c, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-text-tertiary-light dark:text-text-tertiary-dark">{c.name}</span>
                      <span className="text-text-primary-light dark:text-text-primary-dark">{c.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Area */}
          <div className="border-t border-border-light dark:border-border-dark p-4 space-y-3 flex-shrink-0">
            {/* Style selector + controls row */}
            <div className="flex items-center gap-2">
              {/* Style dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowStyleMenu((v) => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark text-xs text-text-secondary-light dark:text-text-secondary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                >
                  <StyleIcon className="w-3.5 h-3.5" />
                  {currentStyle.label}
                  <ChevronDown className="w-3 h-3" />
                </button>

                <AnimatePresence>
                  {showStyleMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -5 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full left-0 mb-2 w-52 bg-card-light dark:bg-card-dark rounded-squircle-sm shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden z-50"
                    >
                      {STYLE_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          onClick={() => void handleSelectStyle(option.key)}
                          className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                            selectedStyle === option.key
                              ? 'bg-surface-light dark:bg-surface-dark'
                              : 'hover:bg-background-light/50 dark:hover:bg-background-dark/50'
                          }`}
                        >
                          <option.icon
                            className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                              selectedStyle === option.key
                                ? 'text-accent-warm'
                                : 'text-text-secondary-light dark:text-text-secondary-dark'
                            }`}
                          />
                          <div>
                            <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                              {option.label}
                            </p>
                            <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                              {option.description}
                            </p>
                          </div>
                          {selectedStyle === option.key && (
                            <Check className="w-3.5 h-3.5 text-accent-warm ml-auto mt-0.5 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {savedStyleProfiles.length > 0 && (
                <select
                  value={selectedSavedStyleProfileId}
                  onChange={(e) => setSelectedSavedStyleProfileId(e.target.value)}
                  className="max-w-36 bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-lg px-2 py-1.5 text-xs text-text-secondary-light dark:text-text-secondary-dark outline-none focus:border-accent-warm/50"
                  title="Saved style profile"
                >
                  <option value="">No saved profile</option>
                  {savedStyleProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex-1" />

              {showStyleConstraints && styleProfile && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent-warm/5 border border-accent-warm/10">
                  <Palette className="w-3 h-3 text-accent-warm" />
                  <span className="text-xs text-accent-warm">
                    {styleProfile.constraints.length} constraints
                  </span>
                  <button onClick={() => setShowStyleConstraints(false)}>
                    <X className="w-3 h-3 text-text-tertiary-light dark:text-text-tertiary-dark" />
                  </button>
                </div>
              )}

              <button
                onClick={copyLastResponse}
                disabled={!messages.some((m) => m.role === 'assistant')}
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center disabled:opacity-30"
                title="Copy last response"
              >
                <Copy className="w-3.5 h-3.5 text-text-tertiary-light dark:text-text-tertiary-dark" />
              </button>
              <button
                onClick={clearChat}
                disabled={messages.length === 0 && !isStreaming}
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center disabled:opacity-30"
                title="Clear chat"
              >
                <X className="w-3.5 h-3.5 text-text-tertiary-light dark:text-text-tertiary-dark" />
              </button>
            </div>

            {/* No API key warning */}
            {isTauri && !savedApiKey && !showApiKeyInput && (
              <button
                onClick={() => setShowApiKeyInput(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 transition-colors"
              >
                <Key className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Add your OpenAI API key to enable AI generation →</span>
              </button>
            )}

            {/* Text input */}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeAction === 'summarize'
                    ? 'Ask AI to summarize selected documents...'
                    : activeAction === 'compare'
                    ? 'Select two documents to compare...'
                    : activeAction === 'outline'
                    ? 'Describe the outline you need...'
                    : 'Ask anything about your documents...'
                }
                rows={2}
                className="flex-1 bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-squircle-sm px-4 py-2.5 text-sm text-text-primary-light dark:text-text-primary-dark placeholder:text-text-tertiary-light dark:placeholder:text-text-tertiary-dark outline-none focus:border-accent-warm/50 resize-none transition-colors"
              />
              {isStreaming ? (
                <button
                  onClick={handleCancelStream}
                  className="w-10 h-10 rounded-squircle-sm bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500/20 transition-colors flex-shrink-0"
                  title="Stop generation"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => void handleSend()}
                  disabled={!inputText.trim()}
                  className="w-10 h-10 rounded-squircle-sm bg-accent-warm text-white flex items-center justify-center hover:bg-accent-warm/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Context info */}
            {currentFiles.length > 0 && (
              <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">
                {currentFiles.length} file{currentFiles.length !== 1 ? 's' : ''} available as context
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
