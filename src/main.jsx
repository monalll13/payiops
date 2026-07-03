import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App.jsx'
import ManagerClaimsPrototype from './pages/ManagerClaimsPrototype.jsx'

// PROTOTYPE switch: เปิด /?manager เพื่อดูโหมดผู้จัดการ (มือถือ) โดยไม่กระทบแอปหลัก
const showManagerPrototype = new URLSearchParams(window.location.search).has('manager')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {showManagerPrototype ? <ManagerClaimsPrototype /> : <App />}
  </StrictMode>,
)
