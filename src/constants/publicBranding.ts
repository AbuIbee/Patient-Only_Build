// Brand identity only. Legal operator, contact, dates and policy terms stay unchanged.
const enterprise = import.meta.env.VITE_ENTERPRISE_SITE === 'true';
export const PUBLIC_APP_NAME = enterprise ? 'Haneen Care Network' : 'My Memoria Ally';
export const PUBLIC_APP_DOMAIN = enterprise ? 'www.haneencarenetwork.com' : 'mymemoriaally.com';
