import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.memoriahelps.ap',
  appName: 'MyMemoriaAlly',
  webDir: 'dist',
  server: {
    url: 'https://www.mymemoriaally.com',
    androidScheme: 'https',
    allowNavigation: ['www.mymemoriaally.com']
  },
  // ... any other existing configuration
};

export default config;