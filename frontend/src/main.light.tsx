import React from 'react'
import { createRoot } from 'react-dom/client'
import AppLight from './AppLight'
import './light.css'

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <AppLight />
    </React.StrictMode>
  )
}
