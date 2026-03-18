import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Layout from './components/Layout'
import { AppProvider } from './stores/main'
import { AuthProvider } from './hooks/use-auth'

// Pages
import DashboardPage from './pages/Dashboard/Index'
import SchedulingPage from './pages/Scheduling/Index'
import CrmPage from './pages/Crm/Index'
import KitsPage from './pages/Kits/Index'
import SettingsPage from './pages/Settings/Index'
import LeadDetailPage from './pages/Crm/LeadDetail'
import ChatPage from './pages/Chat/Index'
import PublicBookingPage from './pages/PublicBooking/Index'
import NotFound from './pages/NotFound'

const App = () => (
  <AuthProvider>
    <AppProvider>
      <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/agendar/:userId" element={<PublicBookingPage />} />

            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/agendamento" element={<SchedulingPage />} />
              <Route path="/crm" element={<CrmPage />} />
              <Route path="/crm/prescritor/:id" element={<LeadDetailPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/kits" element={<KitsPage />} />
              <Route path="/config" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </BrowserRouter>
    </AppProvider>
  </AuthProvider>
)

export default App
