export type Listener = (value: number, total: number) => void

let listeners: Listener[] = []

export function notifyListeners(value: number, total: number) {
  listeners.forEach(listener => listener(value, total))
}

export function removeListener(listener: Listener) {
  listeners = listeners.filter(l => l !== listener)
}

export function addListener(listener: Listener) {
  removeListener(listener)
  listeners.push(listener)
}
