# Springcrush Club

A static club gallery app with Supabase login, artwork uploads, admin moderation, real-time public gallery updates, meeting schedule editing, and announcements.

## Files

- `index.html` - the app screen
- `styles.css` - visual design
- `app.js` - auth, uploads, moderation, and real-time updates
- `config.js` - your Supabase project URL and anon key
- `supabase-schema.sql` - database tables, storage policies, and RLS

## Run Locally

Open `index.html` directly, or serve the folder:

```powershell
python -m http.server 5173
```

Then open `http://localhost:5173`.

With empty Supabase keys, the site runs in demo mode.

## Connect Supabase

1. Create a free Supabase project.
2. In Supabase, go to SQL Editor and run `supabase-schema.sql`.
3. Go to Storage and create a public bucket named `artwork`.
4. Go to Project Settings > API.
5. Copy your Project URL and anon public key into `config.js`.
6. Sign up once from the website with display name `Nael`.
7. In Supabase SQL Editor, run the first-admin update below with `nael.sify@gmail.com`.

The anon key is designed to be public in browser apps. The Row Level Security policies are what protect member data and admin actions.

## Give Someone Admin Privileges

First, the person must sign up through the website. After your own account is admin, open the Admin panel on the site and use the Admin access form to promote or demote members by email.

To make your first account admin, open Supabase > SQL Editor and run:

```sql
update public.profiles
set role = 'admin'
where id = (
  select id
  from auth.users
  where email = 'nael.sify@gmail.com'
);
```

To manually remove admin access:

```sql
update public.profiles
set role = 'member'
where id = (
  select id
  from auth.users
  where email = 'their-email@example.com'
);
```

## Host Online

GitHub Pages, Netlify, or Vercel can host this because it is a static app.

For GitHub Pages:

1. Create a GitHub repository.
2. Push these files.
3. In the repo, open Settings > Pages.
4. Choose the main branch and root folder.
5. Save. GitHub gives you a public URL.

Supabase stays separate from GitHub Pages and safely stores accounts, hashed passwords, database rows, and uploaded artwork.
