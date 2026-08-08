import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Toaster } from "@/components/toaster";
import { AuthProvider } from "@/lib/AuthContext";
import { WalletProvider } from "@/lib/wallet-context";
import { queryClient } from "@/lib/query-client";
import { PageNotFound } from "@/lib/PageNotFound";
import { Landing } from "@/pages/Landing";
import { Explore } from "@/pages/Explore";
import { Library } from "@/pages/Library";
import { CreatorProfile } from "@/pages/CreatorProfile";
import { CreatorStudio } from "@/pages/CreatorStudio";
import { Admin } from "@/pages/Admin";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { ResetPassword } from "@/pages/ResetPassword";
import { OAuthConsent } from "@/pages/OAuthConsent";

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WalletProvider>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Landing />} />
                <Route path="explore" element={<Explore />} />
                <Route
                  path="library"
                  element={
                    <ProtectedRoute>
                      <Library />
                    </ProtectedRoute>
                  }
                />
                <Route path="creator/:handle" element={<CreatorProfile />} />
                <Route
                  path="studio"
                  element={
                    <ProtectedRoute>
                      <CreatorStudio />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin"
                  element={
                    <ProtectedRoute role="admin">
                      <Admin />
                    </ProtectedRoute>
                  }
                />
              </Route>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/oauth/consent" element={<OAuthConsent />} />
              <Route path="*" element={<PageNotFound />} />
            </Routes>
            <Toaster />
          </WalletProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
