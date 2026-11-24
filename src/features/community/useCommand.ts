import { useRef, useState } from 'react'

export function useCommand() {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const running = useRef(false)

  function run(task: () => Promise<unknown>) {
    if (running.current) return
    running.current = true
    setPending(true)
    setError('')
    void task().catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : 'Die Aktion konnte nicht bestätigt werden.')
    }).finally(() => {
      running.current = false
      setPending(false)
    })
  }
  return { run, pending, error }
}
