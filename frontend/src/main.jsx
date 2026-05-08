import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles.css'

const link = document.createElement('link')
link.rel = 'stylesheet'
link.href = '/static/css/sb-admin-2.min.css'
document.head.appendChild(link)

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
