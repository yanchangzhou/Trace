'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  X,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  assembleAiPrompt,
  parseAiOutput,
  saveGenerationRun,
  markGenerationAdopted,
  setApiKey,
  hasApiKey,
  getMaskedApiKey,
  deleteApiKey,
  getStorageLocation,
  type WritingTask,
  type StructuredOutput,
} from '@/lib/tauri';

const SCENES = [
  { value: 'wechat_article', label: 'WeChat Article' },
  { value: 'long_email', label: 'Long Email' },
  { value: 'course_paper', label: 'Course Paper' },
  { value: 'homework', label: 'Homework' },
  { value: 'business_proposal', label: 'Business Proposal' },
  { value: 'social_media', label: 'Social Media' },
];

const STAGES = [
  { value: 'outline', label: 'Generate Outline' },
  { value: 'expand', label: 'Expand Text' },
  { value: 'rewrite', label: 'Rewrite' },
  { value: 'polish', label: 'Polish Language' },
  { value: 'de_ai', label: 'De-AI / Humanize' },
  { value: 'compress', label: 'Compress' },
  { value: 'title_gen', label: 'Generate Titles' },
  { value: 'summary', label: 'Summarize' },
  { value: 'continue', label: 'Continue Writing' },
];

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'academic', label: 'Academic' },
  { value: 'creative', label: 'Creative' },
  { value: 'persuasive', label: 'Persuasive' },
  { value: 'casual', label: 'Casual' },
];

interface AiModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
  currentNoteId: number | null;
  isTauri: boolean;
}

export default function AiModal({ isOpen, onClose, editor, currentNoteId, isTauri }: AiModalProps) {
  // ── AI structured form state ──
  const [aiScene, setAiScene] = useState('wechat_article');
  const [aiStage, setAiStage] = useState('outline');
  const [aiTargetAudience, setAiTargetAudience] = useState('');
  const [aiPurpose, setAiPurpose] = useState('');
  const [aiTone, setAiTone] = useState('professional');
  const [aiWordCount, setAiWordCount] = useState('');
  const [aiMustInclude, setAiMustInclude] = useState('');
  const [aiMustExclude, setAiMustExclude] = useState('');
  const [aiUserPrompt, setAiUserPrompt] = useState('');
  const [aiAssembledPrompt, setAiAssembledPrompt] = useState('');
  const [aiRawResponse, setAiRawResponse] = useState('');
  const [aiStructuredOutput, setAiStructuredOutput] = useState<StructuredOutput | null>(null);
  const [aiCurrentRunId, setAiCurrentRunId] = useState<number | null>(null);
  const [aiCopySuccess, setAiCopySuccess] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // ── API Key management ──
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null);
  const [apiKeyExists, setApiKeyExists] = useState(false);
  const [storageLocation, setStorageLocation] = useState('');
  const [showApiKeySection, setShowApiKeySection] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState('');

  // Reset form + load API key status on open
  useEffect(() => {
    if (!isOpen) return;

    setAiScene('wechat_article');
    setAiStage('outline');
    setAiTargetAudience('');
    setAiPurpose('');
    setAiTone('professional');
    setAiWordCount('');
    setAiMustInclude('');
    setAiMustExclude('');
    setAiUserPrompt('');
    setAiAssembledPrompt('');
    setAiRawResponse('');
    setAiStructuredOutput(null);
    setAiCurrentRunId(null);
    setAiCopySuccess(false);
    setShowApiKeySection(false);

    if (isTauri) {
      Promise.all([hasApiKey(), getMaskedApiKey(), getStorageLocation()])
        .then(([exists, masked, location]) => {
          setApiKeyExists(exists);
          setApiKeyMasked(masked);
          setStorageLocation(location);
        })
        .catch(() => {});
      setApiKeyInput('');
      setApiKeyMessage('');
    }
  }, [isOpen, isTauri]);

  const handleAssemblePrompt = async () => {
    if (!currentNoteId || !isTauri) return;
    setIsAiLoading(true);
    try {
      const task: WritingTask = {
        scene: aiScene,
        stage: aiStage,
        target_audience: aiTargetAudience,
        purpose: aiPurpose,
        tone: aiTone,
        word_count_target: aiWordCount ? Number(aiWordCount) : null,
        must_include: aiMustInclude.split('\n').filter(Boolean),
        must_exclude: aiMustExclude.split('\n').filter(Boolean),
        file_scope: null,
        user_prompt: aiUserPrompt,
      };
      const prompt = await assembleAiPrompt(currentNoteId, task);
      setAiAssembledPrompt(prompt);
      const runId = await saveGenerationRun(currentNoteId, aiScene, aiStage, JSON.stringify(task), prompt);
      setAiCurrentRunId(runId);
    } catch (error) {
      console.error('Prompt assembly failed:', error);
      setAiAssembledPrompt('Error: Failed to assemble prompt. Make sure sources are attached to this note.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleParseResponse = async () => {
    if (!aiRawResponse.trim()) return;
    try {
      const parsed = await parseAiOutput(aiRawResponse);
      setAiStructuredOutput(parsed);
    } catch (error) {
      console.error('Failed to parse output:', error);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiAssembledPrompt);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = aiAssembledPrompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setAiCopySuccess(true);
    setTimeout(() => setAiCopySuccess(false), 2000);
  };

  const handleInsertAiResult = () => {
    if (editor && aiStructuredOutput) {
      editor.commands.insertContent(aiStructuredOutput.body || '');
      if (aiCurrentRunId) {
        markGenerationAdopted(aiCurrentRunId).catch(() => {});
      }
      onClose();
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      const msg = await setApiKey(apiKeyInput.trim());
      setApiKeyMessage(msg);
      setApiKeyInput('');
      const [masked, location] = await Promise.all([getMaskedApiKey(), getStorageLocation()]);
      setApiKeyMasked(masked);
      setStorageLocation(location);
      setApiKeyExists(true);
    } catch (e) {
      setApiKeyMessage(`Error: ${String(e)}`);
    }
  };

  const handleDeleteApiKey = async () => {
    if (!confirm('Remove API key from secure storage?')) return;
    try {
      const msg = await deleteApiKey();
      setApiKeyMessage(msg);
      setApiKeyInput('');
      setApiKeyMasked(null);
      setApiKeyExists(false);
    } catch (e) {
      setApiKeyMessage(`Error: ${String(e)}`);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-light dark:bg-surface-dark rounded-squircle-lg p-6 w-full max-w-3xl mx-4 shadow-ambient-lg dark:shadow-ambient-lg-dark max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent-warm" />
                AI Writing Assistant
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-background-light dark:hover:bg-background-dark flex items-center justify-center"
              >
                <X className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
              </button>
            </div>

            {/* Section 1: Structured Input Form */}
            <div className="space-y-3 mb-6">
              {/* Row: Scene + Stage */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Scene</label>
                  <select value={aiScene} onChange={(e) => setAiScene(e.target.value)}
                    className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm"
                  >
                    {SCENES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Task</label>
                  <select value={aiStage} onChange={(e) => setAiStage(e.target.value)}
                    className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm"
                  >
                    {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Row: Audience + Purpose */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Target Audience</label>
                  <input type="text" value={aiTargetAudience} onChange={(e) => setAiTargetAudience(e.target.value)}
                    placeholder="General readers..."
                    className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Purpose</label>
                  <input type="text" value={aiPurpose} onChange={(e) => setAiPurpose(e.target.value)}
                    placeholder="Inform, persuade, explain..."
                    className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm"
                  />
                </div>
              </div>

              {/* Row: Tone + Word Count */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Tone</label>
                  <select value={aiTone} onChange={(e) => setAiTone(e.target.value)}
                    className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm"
                  >
                    {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Word Count Target</label>
                  <input type="number" value={aiWordCount} onChange={(e) => setAiWordCount(e.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm"
                  />
                </div>
              </div>

              {/* Row: Must Include + Must Exclude */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Must Include (one per line)</label>
                  <textarea value={aiMustInclude} onChange={(e) => setAiMustInclude(e.target.value)}
                    placeholder="Key point 1&#10;Key point 2"
                    rows={3}
                    className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Must Exclude (one per line)</label>
                  <textarea value={aiMustExclude} onChange={(e) => setAiMustExclude(e.target.value)}
                    placeholder="Topic to avoid&#10;Phrase to ban"
                    rows={3}
                    className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm resize-none"
                  />
                </div>
              </div>

              {/* Additional prompt */}
              <div>
                <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Additional Instructions</label>
                <textarea value={aiUserPrompt} onChange={(e) => setAiUserPrompt(e.target.value)}
                  placeholder="Any other specific requirements..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm resize-none"
                />
              </div>

              {/* Assemble Button */}
              <button
                onClick={handleAssemblePrompt}
                disabled={isAiLoading}
                className="w-full py-3 rounded-squircle bg-accent-warm text-white font-medium hover:bg-accent-warm/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Assembling...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Assemble Prompt
                  </>
                )}
              </button>
            </div>

            {/* Section 2: Assembled Prompt Preview */}
            {aiAssembledPrompt && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">Assembled Prompt</h3>
                  <button onClick={handleCopyPrompt}
                    className="px-3 py-1.5 rounded-lg bg-accent-warm/10 text-accent-warm text-sm font-medium hover:bg-accent-warm/20 transition-colors"
                  >
                    {aiCopySuccess ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                </div>
                <div className="bg-card-light dark:bg-card-dark rounded-squircle p-4 text-xs text-text-primary-light dark:text-text-primary-dark leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto border border-border-light dark:border-border-dark">
                  {aiAssembledPrompt}
                </div>
                <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark mt-2">
                  Copy the prompt above to your AI service (ChatGPT, Claude, etc.), then paste the AI&apos;s response below.
                </p>

                {/* Paste-back area */}
                <div className="mt-3">
                  <label className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark mb-1 block">Paste AI Response Here</label>
                  <textarea value={aiRawResponse} onChange={(e) => setAiRawResponse(e.target.value)}
                    placeholder="Paste the AI-generated response..."
                    rows={5}
                    className="w-full px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm resize-none"
                  />
                  <button onClick={handleParseResponse} disabled={!aiRawResponse.trim()}
                    className="mt-2 px-4 py-2 rounded-lg bg-accent-cool/10 text-accent-cool text-sm font-medium hover:bg-accent-cool/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Parse Response
                  </button>
                </div>
              </motion.div>
            )}

            {/* Section 3: Structured Output Display */}
            {aiStructuredOutput && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-t border-border-light dark:border-border-dark pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">Structured Output</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={handleInsertAiResult}
                      className="px-3 py-1.5 rounded-lg bg-accent-warm/10 text-accent-warm text-sm font-medium hover:bg-accent-warm/20 transition-colors"
                    >
                      Insert into Editor
                    </button>
                  </div>
                </div>

                {aiStructuredOutput.title && (
                  <div className="mb-3">
                    <span className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark">Title</span>
                    <p className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark mt-1">{aiStructuredOutput.title}</p>
                  </div>
                )}

                {aiStructuredOutput.summary && (
                  <div className="mb-3">
                    <span className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark">Summary</span>
                    <p className="text-sm text-text-primary-light dark:text-text-primary-dark mt-1">{aiStructuredOutput.summary}</p>
                  </div>
                )}

                <div className="mb-3">
                  <span className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark">Body</span>
                  <div className="bg-card-light dark:bg-card-dark rounded-squircle p-4 mt-1 text-sm text-text-primary-light dark:text-text-primary-dark leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto border border-border-light dark:border-border-dark">
                    {aiStructuredOutput.body}
                  </div>
                </div>

                {aiStructuredOutput.citations.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark">Citations</span>
                    <ul className="mt-1 space-y-1">
                      {aiStructuredOutput.citations.map((c, i) => (
                        <li key={i} className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            )}

            {/* Section 4: API Key Settings */}
            <div className="border-t border-border-light dark:border-border-dark pt-4 mt-4">
              <button
                onClick={() => setShowApiKeySection(!showApiKeySection)}
                className="flex items-center gap-1 text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark hover:text-accent-warm transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showApiKeySection ? 'rotate-0' : '-rotate-90'}`} />
                API Key Settings
              </button>

              {showApiKeySection && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-3">
                  <div className="bg-accent-warm/5 border border-accent-warm/20 rounded-squircle p-3">
                    <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark leading-relaxed">
                      Your API key is stored securely in <span className="font-medium text-accent-warm">{storageLocation || 'the platform credential store'}</span>.
                      It never leaves your device and is not uploaded to any server.
                    </p>
                  </div>

                  {apiKeyExists && apiKeyMasked && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-text-secondary-light dark:text-text-secondary-dark">Stored key:</span>
                      <code className="text-xs bg-card-light dark:bg-card-dark px-2 py-0.5 rounded">{apiKeyMasked}</code>
                      <button
                        onClick={handleDeleteApiKey}
                        className="text-xs text-red-500 hover:text-red-600 transition-colors ml-auto"
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={apiKeyExists ? 'Enter new key to update...' : 'Paste your OpenAI API key (sk-...)'}
                      className="flex-1 px-3 py-2 rounded-squircle bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark placeholder-text-tertiary-light dark:placeholder-text-tertiary-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-warm text-sm"
                    />
                    <button
                      onClick={handleSaveApiKey}
                      disabled={!apiKeyInput.trim()}
                      className="px-4 py-2 rounded-squircle bg-accent-warm text-white text-sm font-medium hover:bg-accent-warm/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save
                    </button>
                  </div>

                  {apiKeyMessage && (
                    <p className="text-xs text-text-tertiary-light dark:text-text-tertiary-dark">{apiKeyMessage}</p>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
