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
import KitsPage from './pages/Kits/Index'
import SettingsPage from './pages/Settings/Index'
import LogsPage from './pages/Logs/Index'
import ChatPage from './pages/Chat/Index'
import PublicBookingPage from './pages/PublicBooking/Index'
import LeadCapturePage from './pages/LeadCapture/Index'
import NpsPage from './pages/NPS/Index'
import NotFound from './pages/NotFound'
import GoogleCallback from './pages/Auth/GoogleCallback'
import CrmPage from './pages/Crm/Index'
import LeadDetail from './pages/Crm/LeadDetail'

const App = () => (
  <AuthProvider>
    <AppProvider>
      <BrowserRouter>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/agendar/:userId" element={<PublicBookingPage />} />
            <Route path="/contato/:userId" element={<LeadCapturePage />} />
            <Route path="/nps/:appointmentId" element={<NpsPage />} />
            <Route path="/auth/callback/google" element={<GoogleCallback />} />

            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/agendamento" element={<SchedulingPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/kits" element={<KitsPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/config" element={<SettingsPage />} />
              <Route path="/crm" element={<CrmPage />} />
              <Route path="/crm/prescritor/:id" element={<LeadDetail />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </BrowserRouter>
    </AppProvider>
  </AuthProvider>
)

export default App
