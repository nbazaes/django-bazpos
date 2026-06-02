import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { initTheme } from './lib/theme'
import { router } from './router'
import './index.css'
import './styles.css'
import './design-system.css'

initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
