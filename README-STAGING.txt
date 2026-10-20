MyMemoria Ally - Staging Client Configuration

This archive contains one file: .env.staging.local
Place that file in the root of C:\Users\solod\OneDrive\Desktop\MyMemoria_Functional_Remediation_001\repo
Do not put it in src/ or in supabase/.
The repo .gitignore contains .env.* so the file is ignored by Git.

Run: npm run dev -- --mode staging --host 127.0.0.1
BEFORE creating test accounts, inspect browser network traffic and confirm ALL Supabase requests use axurszlibxwwptkczztt.supabase.co. No requests to ktehhvmmwnsbcvpjcmzt.supabase.co. Fail closed if a production URL is detected.

Important: This is the public legacy anon client key, NOT a database password or service-role key.
Never use actual patient data or real payment transactions. Clean up synthetic test data after use.
Only staging should be tested. Do not merge or deploy production from this package.
