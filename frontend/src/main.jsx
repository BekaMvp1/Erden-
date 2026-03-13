import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/print.css'

// Режим печати: bw (по умолчанию) или color
const printTheme = (import.meta.env.VITE_PRINT_THEME || 'bw').toLowerCase()
document.documentElement.setAttribute('data-print-theme', printTheme === 'color' ? 'color' : 'bw')
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { PrintProvider } from './context/PrintContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <PrintProvider>
        <App />
      </PrintProvider>
    </ErrorBoundary>
  </StrictMode>,
)
