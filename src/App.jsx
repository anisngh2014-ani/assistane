import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import RegisterDevice from '@/pages/RegisterDevice';
import Sessions from '@/pages/Sessions';
import Devices from '@/pages/Devices';
import Profile from '@/pages/Profile';
import DownloadAgent from '@/pages/DownloadAgent';
import DownloadViewer from '@/pages/DownloadViewer';

import AdminDashboard from '@/pages/AdminDashboard';
import Connect from '@/pages/Connect';
import OwnerDashboard from '@/pages/OwnerDashboard';
import WorkspaceSetup from '@/pages/WorkspaceSetup';
import AccountLogin from '@/pages/AccountLogin';
import CustomerDashboard from '@/pages/CustomerDashboard';
import CustomerRegisterDevice from '@/pages/CustomerRegisterDevice';
import ViewerDownload from '@/pages/ViewerDownload';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const publicPaths = [
    "/account-login",
    "/connect",
    "/customer-dashboard",
    "/customer-register-device",
    "/CustomerRegisterDevice",
    "/download-agent",
    "/download-viewer",
  ];
  const isPublicPath = publicPaths.includes(window.location.pathname);

  if (!isPublicPath && (isLoadingPublicSettings || isLoadingAuth)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isPublicPath && authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/account-login" element={<AccountLogin />} />
      <Route path="/customer-dashboard" element={<CustomerDashboard />} />
      <Route path="/customer-register-device" element={<CustomerRegisterDevice />} />
      <Route path="/CustomerRegisterDevice" element={<Navigate to="/customer-register-device" replace />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/viewer" element={<Navigate to="/download-viewer" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/register-device" element={<RegisterDevice />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/remote-session" element={<Navigate to="/download-viewer" replace />} />

          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/AdminDashboard" element={<Navigate to="/admin" replace />} />
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/workspace-setup" element={<WorkspaceSetup />} />
          <Route path="/screen-viewer" element={<Navigate to="/download-viewer" replace />} />
          <Route path="/viewer-download" element={<ViewerDownload />} />
        </Route>
      </Route>

      <Route path="/connect" element={<Connect />} />
      <Route path="/download-agent" element={<DownloadAgent />} />
      <Route path="/download-viewer" element={<DownloadViewer />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
