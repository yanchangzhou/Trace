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
  Save,
  Trash2,
  Bookmark,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorContext } from '@/contexts/EditorContext';
import { useBook } from '@/contexts/BookContext';
import type { AIMessage, WritingStyle, StyleProfile, AIRequest, SavedStyleProfile } from '@/types';
import StreamingComposer from './StreamingComposer';
import {
  streamGenerate, getStyleProfile, isTauriEnvironment,
  listSavedStyleProfiles,
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

interface GoalTemplate {
  id: string;
  name: string;
  goal: string;
  audience: string;
  language: string;
  length: string;
  outputMode: string;
}

const TEMPLATES_STORAGE_KEY = 'trace_goal_templates';

function loadTemplates(): GoalTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTemplatesToStorage(templates: GoalTemplate[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

export default function AIPanel() {
  const { isAIPanelOpen, setAIPanelOpen, insertGeneratedText, replaceSelection } = useEditorContext();
  const { currentFiles } = useBook();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [activeAction, setActiveAction] = useState<string>('free');
  const [selectedStyle, setSelectedStyle] = useState<WritingStyle>('default');
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [savedStyleProfiles, setSavedStyleProfiles] = useState<SavedStyleProfile[]>([]);
  const [selectedSavedStyleProfileId, setSelectedSavedStyleProfileId] = useState('');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showStyleConstraints, setShowStyleConstraints] = useState(false);

  // Writing fields
  const [goal, setGoal] = useState('');
  const [audience, setAudience] = useState('');
  const [length, setLength] = useState('');
  const [language, setLanguage] = useState('');
  const [outputMode, setOutputMode] = useState('draft');
  const [showWritingFields, setShowWritingFields] = useState(false);

  // Goal templates
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateSaveName, setTemplateSaveName] = useState('');
  const [showTemplateSaveInput, setShowTemplateSaveInput] = useState(false);

  const cancelStreamRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  // Load templates on mount
  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  // Load saved style profiles on open
  useEffect(() => {
    if (!isAIPanelOpen) return;
    if (isTauriEnvironment()) {
      listSavedStyleProfiles().then(setSavedStyleProfiles).catch(() => setSavedStyleProfiles([]));
    }
  }, [isAIPanelOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuffer]);

  // Close template menu on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!templateMenuRef.current) return;
      if (templateMenuRef.current.contains(e.target as Node)) return;
      setShowTemplates(false);
      setShowTemplateSaveInput(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const currentStyle = STYLE_OPTIONS.find((s) => s.key === selectedStyle) ?? STYLE_OPTIONS[0];
  const StyleIcon = currentStyle.icon;

  // ── Template management ──

  const handleSaveTemplate = useCallback(() => {
    const name = templateSaveName.trim();
    if (!name || !goal.trim()) return;
    const newTemplate: GoalTemplate = {
      id: `tpl-${Date.now()}`,
      name,
      goal: goal.trim(),
      audience: audience.trim(),
      language,
      length: length.trim(),
      outputMode,
    };
    const updated = [...templates, newTemplate];
    setTemplates(updated);
    saveTemplatesToStorage(updated);
    setTemplateSaveName('');
    setShowTemplateSaveInput(false);
  }, [templateSaveName, goal, audience, language, length, outputMode, templates]);

  const handleLoadTemplate = useCallback((template: GoalTemplate) => {
    setGoal(template.goal);
    setAudience(template.audience);
    setLanguage(template.language);
    setLength(template.length);
    setOutputMode(template.outputMode);
    setShowTemplates(false);
  }, []);

  const handleDeleteTemplate = useCallback((id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    saveTemplatesToStorage(updated);
  }, [templates]);

  // ── Send ──

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    if (!isTauriEnvironment()) {
      const demoMsg: AIMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content:
          'AI generation requires the desktop app. Run `npm run tauri dev` to launch.',
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
      goal: goal.trim() || undefined,
      audience: audience.trim() || undefined,
      length: length.trim() || undefined,
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
  }, [inputText, isStreaming, currentFiles, activeAction, selectedStyle, selectedSavedStyleProfileId, goal, audience, length, language, outputMode]);

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
    if (key === 'my_style' && isTauriEnvironment()) {
      const profile = await getStyleProfile('my_style');
      if (profile) {
        setStyleProfile(profile);
        setShowStyleConstraints(true);
      }
    } else {
      setShowStyleConstraints(false);
    }
  }, []);

  const hasTemplates = templates.length > 0;

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
            <button
              onClick={() => setAIPanelOpen(false)}
              className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors flex items-center justify-center"
            >
              <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
            </button>
          </div>

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

          {/* Writing Goal Section */}
          <div className="border-b border-border-light dark:border-border-dark flex-shrink-0 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark">
                Writing Goal
              </label>
              <div className="flex items-center gap-1">
                {/* Templates dropdown */}
                <div className="relative" ref={templateMenuRef}>
                  {hasTemplates && (
                    <button
                      onClick={() => { setShowTemplates((v) => !v); setShowTemplateSaveInput(false); }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-tertiary-light dark:text-text-tertiary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                      title="Load template"
                    >
                      <Bookmark className="w-3 h-3" />
                      Templates
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                  )}

                  <AnimatePresence>
                    {showTemplates && hasTemplates && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-1 w-56 bg-card-light dark:bg-card-dark rounded-lg shadow-ambient-lg dark:shadow-ambient-lg-dark border border-border-light dark:border-border-dark overflow-hidden z-50"
                      >
                        <div className="max-h-48 overflow-y-auto">
                          {templates.map((tpl) => (
                            <div
                              key={tpl.id}
                              className="flex items-center group hover:bg-background-light dark:hover:bg-background-dark"
                            >
                              <button
                                onClick={() => handleLoadTemplate(tpl)}
                                className="flex-1 text-left px-3 py-2"
                              >
                                <p className="text-xs font-medium text-text-primary-light dark:text-text-primary-dark truncate">
                                  {tpl.name}
                                </p>
                                <p className="text-[10px] text-text-tertiary-light dark:text-text-tertiary-dark truncate">
                                  {tpl.goal.slice(0, 50)}
                                </p>
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(tpl.id)}
                                className="px-2 py-2 text-text-tertiary-light dark:text-text-tertiary-dark hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                title="Delete template"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Save template button */}
                <button
                  onClick={() => setShowTemplateSaveInput((v) => !v)}
                  disabled={!goal.trim()}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-tertiary-light dark:text-text-tertiary-dark hover:bg-background-light dark:hover:bg-background-dark transition-colors disabled:opacity-30"
                  title="Save as template"
                >
                  <Save className="w-3 h-3" />
                </button>

                {/* Expand/collapse writing fields */}
                <button
                  onClick={() => setShowWritingFields((v) => !v)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    showWritingFields
                      ? 'text-accent-warm bg-accent-warm/5'
                      : 'text-text-tertiary-light dark:text-text-tertiary-dark hover:bg-background-light dark:hover:bg-background-dark'
                  }`}
                  title="More options"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showWritingFields ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Template save input */}
            <AnimatePresence>
              {showTemplateSaveInput && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 pb-1">
                    <input
                      type="text"
                      value={templateSaveName}
                      onChange={(e) => setTemplateSaveName(e.target.value)}
                      placeholder="Template name..."
                      className="flex-1 bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded px-2 py-1 text-xs text-text-primary-light dark:text-text-primary-dark outline-none focus:border-accent-warm/50"
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
                    />
                    <button
                      onClick={handleSaveTemplate}
                      disabled={!templateSaveName.trim() || !goal.trim()}
                      className="px-2 py-1 bg-accent-warm text-white rounded text-xs font-medium disabled:opacity-40 hover:bg-accent-warm/90 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Goal textarea */}
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe your writing goal — e.g. 'Write a WeChat article about AI trends' or 'Draft a professional email response to a client'..."
              rows={2}
              className="w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-lg px-3 py-2 text-xs text-text-primary-light dark:text-text-primary-dark placeholder:text-text-tertiary-light dark:placeholder:text-text-tertiary-dark outline-none focus:border-accent-warm/50 resize-none transition-colors"
            />

            {/* Expanded fields */}
            <AnimatePresence>
              {showWritingFields && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
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
                      <label className="text-[10px] text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
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
                      <label className="text-[10px] text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
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
                      <label className="text-[10px] text-text-tertiary-light dark:text-text-tertiary-dark block mb-0.5">
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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
