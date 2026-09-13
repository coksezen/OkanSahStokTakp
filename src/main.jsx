import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './needs-fix.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    let refreshing = false

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none'
      })
      registration.update().catch(() => {})
    } catch {}
  })
}

createRoot(document.getElementById('root')).render(<App />)
