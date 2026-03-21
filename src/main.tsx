import React from 'react'
import ReactDOM from 'react-dom/client'
import AppShell from './AppShell'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  </React.StrictMode>,
)
