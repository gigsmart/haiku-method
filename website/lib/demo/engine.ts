import { useCallback, useEffect, useRef, useState } from "react"
import type { DemoAction, DemoConfig, DemoMessage } from "./types"

export interface ReviewState {
  visible: boolean
  title: string
  intent: string
  criteria: string[]
  gateType: string
  checkedIndexes: number[]
  approveHighlighted: boolean
  isDesignReview: boolean
}

export interface DemoState {
  messages: DemoMessage[]
  files: string[]
  highlightedFile: string | null
  cards: { stage: string; name: string; status: string }[]
  activeStage: string | null
  completedStages: string[]
  playing: boolean
  speed: number
  stepIndex: number
  typing: boolean
  fastForward: string | null
  review: ReviewState
  completed: boolean
  mobileTab: "terminal" | "artifacts" | "board"
  allStagesComplete: boolean
}

export function useDemoEngine(config: DemoConfig) {
  const [state, setState] = useState<DemoState>(() => initialState())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  function initialState(): DemoState {
    return {
      messages: [],
      files: [],
      highlightedFile: null,
      cards: [],
      activeStage: null,
      completedStages: [],
      playing: true,
      speed: 1,
      stepIndex: 0,
      typing: false,
      fastForward: null,
      review: {
        visible: false,
        title: "",
        intent: "",
        criteria: [],
        gateType: "",
        checkedIndexes: [],
        approveHighlighted: false,
        isDesignReview: false,
      },
      completed: false,
      mobileTab: "terminal",
      allStagesComplete: false,
    }
  }

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const applyAction = useCallback(
    (action: DemoAction, prev: DemoState): DemoState => {
      switch (action.type) {
        case "msg":
          return {
            ...prev,
            messages: [
              ...prev.messages,
              { role: action.role, label: action.label, text: action.text },
            ],
          }
        case "file": {
          if (prev.files.includes(action.path)) return { ...prev, highlightedFile: action.path }
          return {
            ...prev,
            files: [...prev.files, action.path],
            highlightedFile: action.path,
          }
        }
        case "card":
          return {
            ...prev,
            cards: [
              ...prev.cards,
              { stage: action.stage, name: action.name, status: action.status },
            ],
          }
        case "updateCard":
          return {
            ...prev,
            cards: prev.cards.map((c) =>
              c.stage === action.stage && c.name === action.name
                ? { ...c, status: action.status }
                : c,
            ),
          }
        case "activateStage": {
          const stageIndex = config.stages.indexOf(action.stage)
          const completedStages = config.stages.slice(0, stageIndex)
          return {
            ...prev,
            activeStage: action.stage,
            completedStages,
          }
        }
        case "typing":
          return { ...prev, typing: true }
        case "removeTyping":
          return { ...prev, typing: false }
        case "fastForward":
          return { ...prev, fastForward: action.seconds }
        case "removeFastForward":
          return { ...prev, fastForward: null }
        case "showReview": {
          let tag = action.gateType || "external gate"
          if (!tag.includes("gate")) tag = tag + " gate"
          return {
            ...prev,
            review: {
              visible: true,
              title: action.title,
              intent: action.intent,
              criteria: action.criteria,
              gateType: tag,
              checkedIndexes: [],
              approveHighlighted: false,
              isDesignReview: false,
            },
          }
        }
        case "showDesignReview":
          return {
            ...prev,
            review: {
              visible: true,
              title: action.title,
              intent: action.intent,
              criteria: [],
              gateType: "ask gate",
              checkedIndexes: [],
              approveHighlighted: false,
              isDesignReview: true,
            },
          }
        case "animateCheckmarks":
          return {
            ...prev,
            review: {
              ...prev.review,
              checkedIndexes: prev.review.criteria.map((_, i) => i),
            },
          }
        case "highlightApprove":
          return {
            ...prev,
            review: { ...prev.review, approveHighlighted: true },
          }
        case "hideReview":
          return {
            ...prev,
            review: { ...prev.review, visible: false },
          }
        case "complete": {
          // Mark all stages complete and all cards completed
          return {
            ...prev,
            allStagesComplete: true,
            completedStages: [...config.stages],
            activeStage: "complete",
            cards: prev.cards.map((c) => ({ ...c, status: "completed" })),
          }
        }
        default:
          return prev
      }
    },
    [config.stages],
  )

  const runStep = useCallback(() => {
    const s = stateRef.current
    if (!s.playing || s.stepIndex >= config.steps.length) return

    const step = config.steps[s.stepIndex]

    setState((prev) => {
      let next = prev
      for (const action of step.actions) {
        next = applyAction(action, next)
      }
      const newIndex = prev.stepIndex + 1
      return { ...next, stepIndex: newIndex }
    })

    // Schedule next step
    const nextIndex = s.stepIndex + 1
    if (nextIndex < config.steps.length) {
      const nextDelay = config.steps[nextIndex].delay / s.speed
      timerRef.current = setTimeout(runStep, nextDelay)
    }
  }, [config.steps, applyAction])

  const startPlayback = useCallback(() => {
    const s = stateRef.current
    if (s.stepIndex < config.steps.length) {
      const nextDelay = config.steps[s.stepIndex].delay / s.speed
      timerRef.current = setTimeout(runStep, nextDelay)
    }
  }, [config.steps, runStep])

  // Start playback on mount
  useEffect(() => {
    if (stateRef.current.playing) {
      startPlayback()
    }
    return clearTimer
  }, [startPlayback, clearTimer])

  const play = useCallback(() => {
    setState((prev) => {
      if (prev.playing) return prev
      return { ...prev, playing: true }
    })
    // Schedule will happen via the effect below
  }, [])

  const pause = useCallback(() => {
    clearTimer()
    setState((prev) => ({ ...prev, playing: false }))
  }, [clearTimer])

  const togglePlayPause = useCallback(() => {
    const s = stateRef.current
    if (s.playing) {
      pause()
    } else {
      setState((prev) => ({ ...prev, playing: true }))
      startPlayback()
    }
  }, [pause, startPlayback])

  const reset = useCallback(() => {
    clearTimer()
    setState(initialState())
  }, [clearTimer])

  // After reset, start playback
  useEffect(() => {
    if (state.playing && state.stepIndex === 0 && timerRef.current === null) {
      startPlayback()
    }
  }, [state.playing, state.stepIndex, startPlayback])

  const setSpeed = useCallback(
    (s: number) => {
      clearTimer()
      setState((prev) => ({ ...prev, speed: s }))
      // Restart with new speed
      setTimeout(() => {
        if (stateRef.current.playing) {
          const cur = stateRef.current
          if (cur.stepIndex < config.steps.length) {
            const nextDelay = config.steps[cur.stepIndex].delay / s
            timerRef.current = setTimeout(runStep, nextDelay)
          }
        }
      }, 0)
    },
    [clearTimer, config.steps, runStep],
  )

  const stepForward = useCallback(() => {
    clearTimer()
    setState((prev) => {
      if (prev.stepIndex >= config.steps.length) return { ...prev, playing: false }
      const step = config.steps[prev.stepIndex]
      let next = prev
      for (const action of step.actions) {
        next = applyAction(action, next)
      }
      return { ...next, stepIndex: prev.stepIndex + 1, playing: false }
    })
  }, [clearTimer, config.steps, applyAction])

  const stepBackward = useCallback(() => {
    clearTimer()
    setState((prev) => {
      const targetIndex = Math.max(0, prev.stepIndex - 1)
      // Replay all steps from 0 to targetIndex-1
      let replayed = initialState()
      replayed.playing = false
      for (let i = 0; i < targetIndex; i++) {
        const step = config.steps[i]
        for (const action of step.actions) {
          replayed = applyAction(action, replayed)
        }
      }
      return { ...replayed, stepIndex: targetIndex, playing: false }
    })
  }, [clearTimer, config.steps, applyAction])

  const setMobileTab = useCallback((tab: "terminal" | "artifacts" | "board") => {
    setState((prev) => ({ ...prev, mobileTab: tab }))
  }, [])

  const showCompletion = useCallback(() => {
    setState((prev) => ({ ...prev, completed: true }))
  }, [])

  // Clear file highlight after 2s
  useEffect(() => {
    if (state.highlightedFile) {
      const t = setTimeout(() => {
        setState((prev) => ({ ...prev, highlightedFile: null }))
      }, 2000)
      return () => clearTimeout(t)
    }
  }, [state.highlightedFile, state.files.length])

  return {
    state,
    play,
    pause,
    togglePlayPause,
    reset,
    setSpeed,
    setMobileTab,
    showCompletion,
    stepForward,
    stepBackward,
    totalSteps: config.steps.length,
    config,
  }
}
