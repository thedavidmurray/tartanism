import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.edgeless.tartanism',
  appName: 'Tartanism',
  webDir: 'app/dist',
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    scheme: 'Tartanism'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#0a0a1a',
      showSpinner: false
    }
  },
  backgroundColor: '#0a0a1a'
};

export default config;
