// Демо-режим: приложение с сгенерированными данными, без регистрации и Supabase.
// Включается кнопкой «Посмотреть демо» на лендинге (localStorage) или VITE_DEMO=1 для разработки.
const DEMO_KEY = 'tonus_demo'

export function isDemoActive(): boolean {
  return import.meta.env.VITE_DEMO === '1' || localStorage.getItem(DEMO_KEY) === '1'
}

export function enableDemo() {
  localStorage.setItem(DEMO_KEY, '1')
}

export function disableDemo() {
  localStorage.removeItem(DEMO_KEY)
}
