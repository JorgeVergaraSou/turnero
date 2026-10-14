import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
// Tipografías propias del sitio (no se piden a Google: el visitante no le manda su IP a nadie)
import '@fontsource/atkinson-hyperlegible-next/latin-400.css'
import '@fontsource/atkinson-hyperlegible-next/latin-500.css'
import '@fontsource/atkinson-hyperlegible-next/latin-700.css'
import '@fontsource/atkinson-hyperlegible-next/latin-400-italic.css'
import '@fontsource/atkinson-hyperlegible-mono/latin-400.css'
import '@fontsource/atkinson-hyperlegible-mono/latin-600.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
