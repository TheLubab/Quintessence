import { useState } from 'react'

import {
  DangerTriangleIcon,
  CheckReadIcon,
  RecordCircleIcon,
  RefreshIcon,
  StarsMinimalisticIcon
} from '@solar-icons/react/linear'

import { UsageStrip } from './usage-strip'
import { Button } from '@/frontend/components/ui/button'
import { Input } from '@/frontend/components/ui/input'
import { useMetaSessionState } from '@/frontend/features/chat/sessions/api'
import { sendMessage } from '@/frontend/features/chat/connection/chat-connection'
import { cn } from '@/frontend/utils/cn'
import type {
  SessionApproval,
  SessionTodo,
  UserInputPrompt,
  UserInputQuestion,
  UserInputQuestionAnswer
} from '@/shared/types'

type MetaSessionPanelProps = {
  workspaceId: string
  sessionId: string | null
}

export function MetaSessionPanel({ workspaceId, sessionId }: MetaSessionPanelProps) {
  const { data } = useMetaSessionState(workspaceId, sessionId)
  if (!sessionId || !data) return null

  const hasApprovals = data.approvals.length > 0
  const hasQuestions = data.questions.length > 0
  const hasTodo = data.todo !== null
  const hasUsage = data.context !== null || data.usage !== null
  if (!hasApprovals && !hasQuestions && !hasTodo && !hasUsage) return null

  return (
    <div className="flex scrollbar-thin max-h-[42vh] flex-col gap-2 overflow-y-auto">
      {data.approvals.map(approval => (
        <ApprovalPrompt
          key={`${approval.approvalId}:${approval.requirementId.sourceIndex}`}
          workspaceId={workspaceId}
          sessionId={sessionId}
          approval={approval}
        />
      ))}
      {data.questions.map(prompt => (
        <QuestionPrompt
          key={prompt.userInputId}
          workspaceId={workspaceId}
          sessionId={sessionId}
          prompt={prompt}
        />
      ))}
      {data.todo && <TodoPanel todo={data.todo} />}
      {hasUsage && (
        <UsageStrip
          key={sessionId}
          context={data.context}
          usage={data.usage}
          request={data.requestUsage}
        />
      )}
    </div>
  )
}

type QuestionPromptProps = {
  workspaceId: string
  sessionId: string
  prompt: UserInputPrompt
}

function QuestionPrompt({ workspaceId, sessionId, prompt }: QuestionPromptProps) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [text, setText] = useState('')

  const selected = (question: UserInputQuestion) => answers[question.id] ?? []
  const setSelected = (question: UserInputQuestion, labels: string[]) =>
    setAnswers(current => ({ ...current, [question.id]: labels }))

  const toggle = (question: UserInputQuestion, label: string) => {
    const current = selected(question)
    if (question.selection.mode === 'single') {
      setSelected(question, [label])
      return
    }
    if (current.includes(label)) {
      setSelected(
        question,
        current.filter(value => value !== label)
      )
      return
    }
    const max = question.selection.maxSelections ?? question.options.length
    if (current.length < max) setSelected(question, [...current, label])
  }

  const submit = () => {
    const payload: UserInputQuestionAnswer[] = prompt.questions.map(question => {
      const labels = selected(question)
      return question.selection.mode === 'multiple'
        ? { questionId: question.id, selectedLabels: labels }
        : { questionId: question.id, selectedLabel: labels[0] ?? '' }
    })
    sendMessage({
      type: 'question_response',
      workspaceId,
      sessionId,
      userInputId: prompt.userInputId,
      action: 'answer',
      answers: payload
    })
  }

  const cancel = () =>
    sendMessage({
      type: 'question_response',
      workspaceId,
      sessionId,
      userInputId: prompt.userInputId,
      action: 'cancel',
      reason: 'Skipped by the user'
    })

  const clarify = () => {
    if (!text.trim()) return
    sendMessage({
      type: 'question_response',
      workspaceId,
      sessionId,
      userInputId: prompt.userInputId,
      action: 'clarify',
      clarification: text.trim()
    })
  }

  const canSubmit = prompt.questions.every(question => {
    const labels = selected(question)
    const min = question.selection.minSelections ?? 1
    const max = question.selection.maxSelections ?? question.options.length
    return labels.length >= min && labels.length <= max
  })

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-card-foreground shadow-xs">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <StarsMinimalisticIcon size={16} strokeWidth={1.75} className="text-muted-foreground" />
        The agent needs your input
      </div>
      <div className="flex flex-col gap-3">
        {prompt.questions.map(question => (
          <div key={question.id} className="flex flex-col gap-1.5">
            <div className="text-xs font-medium text-muted-foreground">{question.header}</div>
            <div className="text-sm">{question.question}</div>
            <div className="flex flex-wrap gap-1.5">
              {question.options.map(option => {
                const active = selected(question).includes(option.label)
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(question, option.label)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted'
                    )}
                  >
                    {option.label}
                    {option.description && (
                      <span className="mt-0.5 block text-xs opacity-70">{option.description}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder="Or explain in your own words"
            maxLength={500}
            className="h-8 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clarify}
            disabled={!text.trim()}
          >
            Clarify
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>
            Skip
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
            Answer
          </Button>
        </div>
      </div>
    </div>
  )
}

type TodoPanelProps = { todo: SessionTodo }

function TodoPanel({ todo }: TodoPanelProps) {
  const done = todo.items.filter(item => item.status === 'completed').length
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-card-foreground shadow-xs">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium">Plan</span>
        <span className="text-muted-foreground tabular-nums">
          {done}/{todo.items.length}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {todo.items.map((item, index) => (
          <div key={`${item.text}:${index}`} className="flex items-start gap-2 text-sm">
            <TodoStatusIcon status={item.status} />
            <span
              className={cn(
                'min-w-0 flex-1',
                item.status === 'completed' && 'text-muted-foreground line-through'
              )}
            >
              {item.status === 'in_progress' && item.activeForm ? item.activeForm : item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type TodoStatusIconProps = { status: SessionTodo['items'][number]['status'] }

function TodoStatusIcon({ status }: TodoStatusIconProps) {
  if (status === 'completed')
    return <CheckReadIcon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" />
  if (status === 'in_progress')
    return <RefreshIcon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 animate-spin" />
  if (status === 'cancelled')
    return (
      <DangerTriangleIcon
        size={16}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0 text-muted-foreground"
      />
    )
  return (
    <RecordCircleIcon
      size={16}
      strokeWidth={1.75}
      className="mt-0.5 shrink-0 text-muted-foreground"
    />
  )
}

type ApprovalPromptProps = {
  workspaceId: string
  sessionId: string
  approval: SessionApproval
}

function ApprovalPrompt({ workspaceId, sessionId, approval }: ApprovalPromptProps) {
  return (
    <section className="rounded-xl bg-card p-3 text-card-foreground ring-1 ring-border">
      <h3 className="text-sm font-medium">Review {approval.toolName}</h3>
      <pre className="my-2 max-h-40 overflow-auto text-xs break-words whitespace-pre-wrap">
        {approval.description}
      </pre>
      <div className="flex flex-wrap gap-2">
        {approval.choices.map(choice => (
          <Button
            key={choice.choiceId}
            variant="outline"
            size="sm"
            title={choice.rulePreview ?? choice.scope}
            onClick={() =>
              sendMessage({
                type: 'approval_response',
                workspaceId,
                sessionId,
                approvalId: approval.approvalId,
                requirementId: approval.requirementId,
                choiceId: choice.choiceId
              })
            }
          >
            {choice.label}
          </Button>
        ))}
      </div>
      {approval.choices
        .filter(choice => choice.rulePreview)
        .map(choice => (
          <p key={choice.choiceId} className="mt-2 text-xs break-words text-muted-foreground">
            {choice.label}: {choice.rulePreview}
          </p>
        ))}
    </section>
  )
}
