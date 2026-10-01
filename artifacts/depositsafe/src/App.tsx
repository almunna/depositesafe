import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HelpPage, PrivacyPage, RefundsPage, TermsPage } from '@/pages/public-info-pages';
import NotFound from '@/pages/not-found';
import {
  AdminPage,
  AuthPage,
  DashboardPage,
  HomePage,
  ProductDetailPage,
  TransactionDetailPage,
} from '@/pages/depositsafe-pages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#2f766c',
    colorForeground: '#20333b',
    colorMutedForeground: '#66777b',
    colorBackground: '#fbfaf5',
    colorInput: '#f8f7f1',
    colorInputForeground: '#20333b',
    colorNeutral: '#d9ded8',
    borderRadius: '0.75rem',
    fontFamily: 'Manrope, sans-serif',
  },
  elements: {
    socialButtonsBlockButton: 'hidden',
    socialButtonsBlockButtonText: 'hidden',
    socialButtonsProviderIcon: 'hidden',
    dividerRow: 'hidden',
  },
};

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/help" component={HelpPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/refunds" component={RefundsPage} />
        <Route path="/products/:slug" component={ProductDetailPage} />
        <Route path="/sign-in/*?" component={() => <AuthPage mode="sign-in" />} />
        <Route path="/sign-up/*?" component={() => <AuthPage mode="sign-up" />} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/transactions/:reference" component={TransactionDetailPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ClerkProvider
            publishableKey={clerkPubKey}
            proxyUrl={clerkProxyUrl}
            appearance={clerkAppearance}
            signInUrl={`${basePath}/sign-in`}
            signUpUrl={`${basePath}/sign-up`}
            localization={{
              signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to view your DepositSafe checks' } },
              signUp: { start: { title: 'Create your account', subtitle: 'Keep your DepositSafe check records together' } },
            }}
          >
            <Router />
          </ClerkProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;