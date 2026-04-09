"use client"

import type { SessionData } from "./hooks/useReviewSession"
import { IntentReview } from "./IntentReview"
import { UnitReview } from "./UnitReview"
import { QuestionForm } from "./QuestionForm"
import { DirectionPicker } from "./DirectionPicker"

interface Props {
  session: SessionData
  baseUrl: string
  onSubmitDecision: (
    decision: "approved" | "changes_requested",
    feedback: string,
    annotations?: { comments?: Array<{ selectedText: string; comment: string; paragraph: number }> },
  ) => Promise<boolean>
  onSubmitAnswers: (
    answers: Array<{ question: string; selectedOptions: string[]; otherText?: string }>,
    feedback?: string,
  ) => Promise<boolean>
  onSubmitDirection: (
    archetype: string,
    parameters: Record<string, number>,
    comments?: string,
  ) => Promise<boolean>
}

export function ReviewRouter({ session, baseUrl, onSubmitDecision, onSubmitAnswers, onSubmitDirection }: Props) {
  if (session.session_type === "review") {
    if (session.review_type === "unit") {
      return <UnitReview session={session} baseUrl={baseUrl} />
    }
    return <IntentReview session={session} baseUrl={baseUrl} />
  }

  if (session.session_type === "question") {
    return <QuestionForm session={session} onSubmit={onSubmitAnswers} />
  }

  if (session.session_type === "design_direction") {
    return <DirectionPicker session={session} onSubmit={onSubmitDirection} />
  }

  return (
    <div className="flex items-center justify-center p-12">
      <p className="text-stone-400">Unknown session type: {session.session_type}</p>
    </div>
  )
}
