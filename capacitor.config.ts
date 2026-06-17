import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.memoriahelps.ap',
  appName: 'My Memoria Ally',
  webDir: 'dist',
  server: {
    url: 'https://www.mymemoriaally.com',
    androidScheme: 'https',
    allowNavigation: [
  'www.mymemoriaally.com',
  'ktehhvmmwnsbcvpjcmzt.supabase.co'
]
  },

};

export default config;
