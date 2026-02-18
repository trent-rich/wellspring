// AI Action Panel for GEODE Chapters
// Allows manual step advancement and AI-assisted workflow actions

import { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  Send,
  Bell,
  FileSignature,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ChapterWorkflowState } from '../../types/geodeWorkflow';
import {
  type GeodeActionTemplate,
  type GeodeQuickAction,
  GEODE_ACTION_TEMPLATES,
  STEP_QUICK_ACTIONS,
  DEFAULT_QUICK_ACTIONS,
} from '../../types/geodeActions';
import { GEODE_STATES, getChapterTypeInfo } from '../../types/geode';
import { useGeodeChapterStore } from '../../store/geodeChapterStore';

// ============================================
// ICON MAPPING
// ============================================

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  ArrowRight,
  Send,
  Bell,
  FileSignature,
  UserCheck,
  Sparkles,
};

function getIcon(iconName: string) {
  return iconMap[iconName] || Sparkles;
}

// ============================================
// TYPES
// ============================================

interface AIActionPanelProps {
  chapter: ChapterWorkflowState;
  onActionSubmit: (action: ActionSubmission) => void;
  onStepAdvance: (notes?: string, nextOwner?: string) => void;
}

export interface ActionSubmission {
  templateId: string;
  actionType: string;
  params: Record<string, string>;
  prompt: string;
  requiresApproval: boolean;
}

interface ActionFormState {
  isOpen: boolean;
  template: GeodeActionTemplate | null;
  params: Record<string, string>;
  isSubmitting: boolean;
  result: { success: boolean; message: string } | null;
}

// ============================================
// ACTION FORM COMPONENT
// ============================================

interface ActionFormProps {
  template: GeodeActionTemplate;
  chapter: ChapterWorkflowState;
  onSubmit: (params: Record<string, string>) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function ActionForm({ template, chapter, onSubmit, onCancel, isSubmitting }: ActionFormProps) {
  const customChapterTypes = useGeodeChapterStore(s => s.customChapterTypes);
  const [params, setParams] = useState<Record<string, string>>(() => {
    // Initialize with default values and chapter context
    const initial: Record<string, string> = {};
    const stateInfo = GEODE_STATES.find(s => s.value === chapter.reportState);
    const chapterType = getChapterTypeInfo(chapter.chapterType, customChapterTypes);

    // Pre-fill context values
    initial['stateName'] = stateInfo?.label || '';
    initial['chapterName'] = chapterType?.label || '';
    initial['currentStep'] = chapter.currentStep;
    initial['currentOwner'] = chapter.currentOwner;

    // Pre-fill from author info if available
    if (chapter.authorName) initial['authorName'] = chapter.authorName;
    if (chapter.authorEmail) initial['authorEmail'] = chapter.authorEmail;

    // Set today's date for date fields
    const today = new Date().toISOString().split('T')[0];
    template.requiredParams.forEach(p => {
      if (p.type === 'date' && !initial[p.key]) {
        initial[p.key] = today;
      }
      if (p.defaultValue) {
        initial[p.key] = p.defaultValue;
      }
    });

    return initial;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(params);
  };

  const renderField = (param: typeof template.requiredParams[0], isRequired: boolean) => {
    const value = params[param.key] || '';

    switch (param.type) {
      case 'textarea':
        return (
          <textarea
            id={param.key}
            value={value}
            onChange={(e) => setParams({ ...params, [param.key]: e.target.value })}
            placeholder={param.placeholder}
            required={isRequired}
            rows={4}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent resize-none"
          />
        );

      case 'select':
        return (
          <select
            id={param.key}
            value={value}
            onChange={(e) => setParams({ ...params, [param.key]: e.target.value })}
            required={isRequired}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            {param.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'date':
        return (
          <input
            type="date"
            id={param.key}
            value={value}
            onChange={(e) => setParams({ ...params, [param.key]: e.target.value })}
            required={isRequired}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent"
          />
        );

      case 'email':
        return (
          <input
            type="email"
            id={param.key}
            value={value}
            onChange={(e) => setParams({ ...params, [param.key]: e.target.value })}
            placeholder={param.placeholder}
            required={isRequired}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent"
          />
        );

      default:
        return (
          <input
            type="text"
            id={param.key}
            value={value}
            onChange={(e) => setParams({ ...params, [param.key]: e.target.value })}
            placeholder={param.placeholder}
            required={isRequired}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent"
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Required parameters */}
      {template.requiredParams.map((param) => (
        <div key={param.key}>
          <label htmlFor={param.key} className="block text-sm font-medium text-gray-700 mb-1">
            {param.label} {param.required && <span className="text-red-500">*</span>}
          </label>
          {renderField(param, param.required)}
        </div>
      ))}

      {/* Optional parameters (collapsible) */}
      {template.optionalParams.length > 0 && (
        <details className="group">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700 list-none flex items-center gap-1">
            <ChevronDown className="w-4 h-4 group-open:hidden" />
            <ChevronUp className="w-4 h-4 hidden group-open:block" />
            Optional settings
          </summary>
          <div className="mt-3 space-y-3 pl-5 border-l-2 border-gray-100">
            {template.optionalParams.map((param) => (
              <div key={param.key}>
                <label htmlFor={param.key} className="block text-sm font-medium text-gray-600 mb-1">
                  {param.label}
                </label>
                {renderField(param, false)}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Approval notice */}
      {template.requiresApproval && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Requires Approval</p>
            <p className="text-amber-700">This action will be queued for your review before executing.</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-watershed-600 hover:bg-watershed-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {template.requiresApproval ? 'Queue Action' : 'Execute'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function AIActionPanel({ chapter, onActionSubmit, onStepAdvance }: AIActionPanelProps) {
  const [formState, setFormState] = useState<ActionFormState>({
    isOpen: false,
    template: null,
    params: {},
    isSubmitting: false,
    result: null,
  });

  const [showAllActions, setShowAllActions] = useState(false);

  // Get quick actions for current step
  const quickActions = STEP_QUICK_ACTIONS[chapter.currentStep] || DEFAULT_QUICK_ACTIONS;

  // Get all applicable templates
  const applicableTemplates = GEODE_ACTION_TEMPLATES.filter(template => {
    // Always include if no restrictions
    if (!template.applicableSteps && !template.applicableWorkflows) return true;

    // Check step restrictions
    if (template.applicableSteps && !template.applicableSteps.includes(chapter.currentStep)) {
      return false;
    }

    // Check workflow restrictions
    if (template.applicableWorkflows && !template.applicableWorkflows.includes(chapter.workflowType)) {
      return false;
    }

    return true;
  });

  const handleQuickAction = (quickAction: GeodeQuickAction) => {
    const template = GEODE_ACTION_TEMPLATES.find(t => t.id === quickAction.templateId);
    if (!template) return;

    // For simple advance, just do it
    if (template.actionType === 'advance_step' && template.requiredParams.length <= 1) {
      onStepAdvance();
      return;
    }

    // Otherwise open the form
    setFormState({
      isOpen: true,
      template,
      params: quickAction.prefillData || {},
      isSubmitting: false,
      result: null,
    });
  };

  const handleTemplateSelect = (template: GeodeActionTemplate) => {
    setFormState({
      isOpen: true,
      template,
      params: {},
      isSubmitting: false,
      result: null,
    });
    setShowAllActions(false);
  };

  const handleFormSubmit = async (params: Record<string, string>) => {
    if (!formState.template) return;

    setFormState(s => ({ ...s, isSubmitting: true }));

    // Build the prompt from template
    let prompt = formState.template.promptTemplate;
    Object.entries(params).forEach(([key, value]) => {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    // Clean up any remaining template markers
    prompt = prompt.replace(/{{#if \w+}}.*?{{\/if}}/g, '');
    prompt = prompt.replace(/{{\w+}}/g, '');

    const submission: ActionSubmission = {
      templateId: formState.template.id,
      actionType: formState.template.actionType,
      params,
      prompt: prompt.trim(),
      requiresApproval: formState.template.requiresApproval,
    };

    // Simulate submission (in real app, this would call an API)
    await new Promise(resolve => setTimeout(resolve, 1000));

    onActionSubmit(submission);

    setFormState(s => ({
      ...s,
      isSubmitting: false,
      result: {
        success: true,
        message: formState.template?.requiresApproval
          ? 'Action queued for approval'
          : 'Action executed successfully',
      },
    }));

    // Auto-close after success
    setTimeout(() => {
      setFormState({
        isOpen: false,
        template: null,
        params: {},
        isSubmitting: false,
        result: null,
      });
    }, 2000);
  };

  const handleFormCancel = () => {
    setFormState({
      isOpen: false,
      template: null,
      params: {},
      isSubmitting: false,
      result: null,
    });
  };

  // Don't show for completed chapters
  if (chapter.currentStep === 'done') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
        <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-2" />
        <p className="text-sm text-green-800">This chapter is complete!</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-watershed-600" />
          <h3 className="font-semibold text-gray-900">Actions</h3>
        </div>
        {!formState.isOpen && (
          <button
            onClick={() => setShowAllActions(!showAllActions)}
            className="text-xs text-watershed-600 hover:text-watershed-700"
          >
            {showAllActions ? 'Show Less' : 'All Actions'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {formState.isOpen && formState.template ? (
          // Action Form
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = getIcon(formState.template.icon);
                  return <Icon className="w-5 h-5 text-watershed-600" />;
                })()}
                <h4 className="font-medium text-gray-900">{formState.template.name}</h4>
              </div>
              <button
                onClick={handleFormCancel}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{formState.template.description}</p>

            {formState.result ? (
              <div className={cn(
                'flex items-center gap-2 p-3 rounded-lg',
                formState.result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              )}>
                {formState.result.success ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
                <span className="text-sm font-medium">{formState.result.message}</span>
              </div>
            ) : (
              <ActionForm
                template={formState.template}
                chapter={chapter}
                onSubmit={handleFormSubmit}
                onCancel={handleFormCancel}
                isSubmitting={formState.isSubmitting}
              />
            )}
          </div>
        ) : showAllActions ? (
          // All Actions List
          <div className="space-y-2">
            {applicableTemplates.map((template) => {
              const Icon = getIcon(template.icon);
              return (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className="w-full flex items-center gap-3 p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Icon className="w-5 h-5 text-gray-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{template.name}</p>
                    <p className="text-xs text-gray-500 truncate">{template.description}</p>
                  </div>
                  {template.requiresApproval && (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                      Approval
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          // Quick Actions
          <div className="space-y-3">
            {/* Quick action buttons */}
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action, index) => {
                const template = GEODE_ACTION_TEMPLATES.find(t => t.id === action.templateId);
                if (!template) return null;
                const Icon = getIcon(template.icon);

                return (
                  <button
                    key={index}
                    onClick={() => handleQuickAction(action)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      action.variant === 'primary' && 'bg-watershed-600 text-white hover:bg-watershed-700',
                      action.variant === 'secondary' && 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                      action.variant === 'warning' && 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {action.label}
                  </button>
                );
              })}
            </div>

            {/* Custom AI prompt input */}
            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => handleTemplateSelect(GEODE_ACTION_TEMPLATES.find(t => t.id === 'custom_ai_action')!)}
                className="w-full flex items-center gap-2 p-3 text-left bg-gradient-to-r from-purple-50 to-blue-50 hover:from-purple-100 hover:to-blue-100 border border-purple-100 rounded-lg transition-colors"
              >
                <Sparkles className="w-5 h-5 text-purple-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-900">Ask AI to do something</p>
                  <p className="text-xs text-purple-600">Describe any action in natural language</p>
                </div>
                <ArrowRight className="w-4 h-4 text-purple-400" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
