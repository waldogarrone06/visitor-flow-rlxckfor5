import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Layout from './components/Layout'
import { AppProvider } from './stores/main'

// Pages
import DashboardPage from './pages/Dashboard/Index'
import SchedulingPage from './pages/Scheduling/Index'
import CrmPage from './pages/Crm/Index'
import KitsPage from './pages/Kits/Index'
import NotFound from './pages/NotFound'

const App = () => (
  <AppProvider>
    <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/agendamento" element={<SchedulingPage />} />
            <Route path="/crm" element={<CrmPage />} />
            <Route path="/kits" element={<KitsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </AppProvider>
)

export default App
