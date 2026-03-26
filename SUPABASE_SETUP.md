# CareCompanion Supabase Setup Guide

This guide will walk you through setting up Supabase as the backend for CareCompanion.

## Overview

CareCompanion now uses Supabase for:
- **Authentication** - User login/signup
- **Database** - Patient data, notes, medications, etc.
- **Row Level Security (RLS)** - Caregivers only see their own patients
- **Real-time sync** - Live updates across devices

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Enter:
   - **Name:** `carecompanion`
   - **Database Password:** (save this securely!)
   - **Region:** Choose closest to your users
4. Click "Create new project"
5. Wait for the project to be created (2-3 minutes)

## Step 2: Get Your API Keys

1. In your Supabase dashboard, go to **Project Settings** (gear icon)
2. Click **API** in the left sidebar
3. Copy these values:
   - **URL** (under Project URL)
   - **anon public** key (under Project API keys)

## Step 3: Set Up Environment Variables

1. In your project folder (`C:\Users\solod\Desktop\Build_New_02-10\app`), create a file named `.env`:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

2. Replace the values with your actual Supabase credentials

## Step 4: Run the Database Migration

1. In your Supabase dashboard, go to the **SQL Editor**
2. Click **New query**
3. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Paste into the SQL Editor
5. Click **Run**

This creates:
- `profiles` table (extends auth.users)
- `patients` table
- `caregiver_patients` table (junction table)
- `patient_notes` table
- `medications`, `medication_schedules`, `medication_logs` tables
- `tasks`, `mood_entries`, `memories`, `appointments`, `care_team_members` tables
- Row Level Security (RLS) policies
- Indexes for performance

## Step 5: Enable Authentication

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Enable **Email** provider (should be enabled by default)
3. (Optional) Configure email templates under **Email Templates**

## Step 6: Test the Setup

1. Start your app locally:
```cmd
cd C:\Users\solod\Desktop\BuildComplete_0212-2026\app
npm run dev
```

2. Open `http://localhost:5173`
3. Sign up as a new caregiver
4. Click "Add Patient" to create your first patient
5. The patient should appear in your dashboard

## Database Schema Overview

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (extends auth.users) |
| `patients` | Patient information |
| `caregiver_patients` | Links caregivers to patients |
| `patient_notes` | Care notes and timeline entries |

### Care Data Tables

| Table | Purpose |
|-------|---------|
| `medications` | Patient medications |
| `medication_schedules` | When medications should be taken |
| `medication_logs` | Record of medication taken/missed |
| `tasks` | Daily tasks and routines |
| `mood_entries` | Mood tracking data |
| `memories` | Photos, stories, memories |
| `appointments` | Medical appointments |
| `care_team_members` | Doctors, therapists, etc. |

## Security (RLS Policies)

The database has Row Level Security enabled:

- **Caregivers can only see their own patients** - enforced by `caregiver_patients` junction table
- **Caregivers can only write notes for their patients** - checked on every insert/update
- **Primary caregivers can delete patients** - only `is_primary = true` can delete

## Troubleshooting

### "Failed to fetch patients" error

1. Check your `.env` file has correct Supabase URL and key
2. Verify the SQL migration was run successfully
3. Check browser console for specific error messages

### "Cannot find module '@supabase/supabase-js'"

```cmd
npm install @supabase/supabase-js
```

### RLS policy errors

If you see "new row violates row-level security policy":
1. Make sure the user is authenticated
2. Check that the caregiver-patient relationship exists in `caregiver_patients`

## Next Steps

After setup is working:

1. **Deploy to Vercel** - Your app will use the same Supabase backend
2. **Add more features** - Medications, appointments, etc. are ready to use
3. **Invite other caregivers** - They can be added to patients with different permission levels

## Environment Variables for Production

When deploying to Vercel, add these environment variables:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |

In Vercel dashboard:
1. Go to your project
2. Click **Settings** → **Environment Variables**
3. Add the variables above
