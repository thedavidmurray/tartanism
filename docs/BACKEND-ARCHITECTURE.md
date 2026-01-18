# Tartanism Backend Architecture Specification

> Generated: 2026-01-18 | Sources: Claude Research Agent + GPT-5.2-Codex (xhigh reasoning)

## Executive Summary

**Recommended Stack: Supabase + Vercel + Cloudflare R2**

Both research sources independently converged on Supabase as the optimal backend for Tartanism due to:
- All-in-one platform (DB + Auth + Storage + Realtime)
- Generous free tier covering early growth
- PostgreSQL power with JSONB for pattern metadata
- Row-level security for community features
- Open source (can self-host if needed)

---

## 1. Recommended Stack

| Layer | Technology | Justification |
|-------|------------|---------------|
| **Database** | Supabase PostgreSQL | Relational schema fits users/patterns/collections; JSONB for flexible pattern data |
| **Auth** | Supabase Auth | Integrated with DB, OAuth + magic links, 50K MAU free |
| **Storage** | Supabase Storage → Cloudflare R2 | Start simple, migrate to R2 when scaling (zero egress cost) |
| **API** | Supabase auto-REST + Edge Functions | Zero config, serverless, integrates with auth |
| **Frontend Hosting** | Keep GitHub Pages or migrate to Vercel | No change needed for MVP |

### Alternative Stack (Budget-Conscious)
```
Database:  PocketBase (self-hosted, free)
Auth:      PocketBase built-in
Storage:   Cloudflare R2 (10GB free)
Hosting:   Railway ($5/mo)
```

---

## 2. Database Schema

### Core Tables

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- User Profiles (linked to Supabase auth.users)
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username CITEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patterns
CREATE TABLE patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  pattern_type TEXT NOT NULL DEFAULT 'threadcount'
    CHECK (pattern_type IN ('threadcount', 'geometric', 'motif', 'image_based')),
  threadcount JSONB NOT NULL,           -- Generator params: sett, colors, symmetry
  seed TEXT,                             -- For reproducibility
  constraints JSONB,                     -- Generation constraints
  motifs JSONB,                          -- Illustrated motif data (if applicable)
  image_path TEXT NOT NULL,              -- Storage key (NOT base64)
  preview_path TEXT,                     -- Thumbnail path
  image_mime TEXT NOT NULL DEFAULT 'image/png',
  image_width INT,
  image_height INT,
  image_bytes INT,
  image_sha256 CHAR(64),                 -- For deduplication
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  share_slug TEXT UNIQUE,                -- Short URL slug
  deleted_at TIMESTAMPTZ,                -- Soft delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- Full-text search column
ALTER TABLE patterns ADD COLUMN search TSVECTOR GENERATED ALWAYS AS (
  to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))
) STORED;

-- Pattern Shares (for unlisted access via token)
CREATE TABLE pattern_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_access_at TIMESTAMPTZ,
  access_count BIGINT NOT NULL DEFAULT 0
);

-- Collections (folders/albums)
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Collection Items (junction table)
CREATE TABLE collection_items (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  pattern_id UUID NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  position INT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, pattern_id)
);

-- Favorites
CREATE TABLE favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_id UUID NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pattern_id)
);

-- Follows (social)
CREATE TABLE follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

-- Comments (optional)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ  -- Soft delete
);

-- Tags (for discovery)
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE pattern_tags (
  pattern_id UUID NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (pattern_id, tag_id)
);

-- Pattern Stats (denormalized for performance)
CREATE TABLE pattern_stats (
  pattern_id UUID PRIMARY KEY REFERENCES patterns(id) ON DELETE CASCADE,
  favorites_count BIGINT NOT NULL DEFAULT 0,
  comments_count BIGINT NOT NULL DEFAULT 0,
  views_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Indexes

```sql
-- Patterns
CREATE INDEX patterns_owner_idx ON patterns (owner_id, created_at DESC);
CREATE INDEX patterns_visibility_idx ON patterns (visibility, published_at DESC);
CREATE INDEX patterns_search_idx ON patterns USING GIN (search);
CREATE INDEX patterns_image_hash_idx ON patterns (image_sha256);

-- Pattern Shares
CREATE INDEX pattern_shares_pattern_idx ON pattern_shares (pattern_id);

-- Collections
CREATE INDEX collections_owner_idx ON collections (owner_id, created_at DESC);
CREATE INDEX collection_items_pattern_idx ON collection_items (pattern_id);

-- Social
CREATE INDEX favorites_pattern_idx ON favorites (pattern_id, created_at DESC);
CREATE INDEX follows_following_idx ON follows (following_id, created_at DESC);
CREATE INDEX comments_pattern_idx ON comments (pattern_id, created_at);
CREATE INDEX pattern_tags_tag_idx ON pattern_tags (tag_id);

-- Stats
CREATE INDEX pattern_stats_popular_idx ON pattern_stats (favorites_count DESC, views_count DESC);
```

### Row-Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read any, update only their own
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = user_id);

-- Patterns: Owner can do anything, public can read public patterns
CREATE POLICY patterns_owner ON patterns
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY patterns_public_read ON patterns
  FOR SELECT USING (
    visibility = 'public'
    OR auth.uid() = owner_id
    OR visibility = 'unlisted'  -- Unlisted readable if you have the URL
  );

-- Collections: Owner can do anything, public can read public collections
CREATE POLICY collections_owner ON collections
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY collections_public_read ON collections
  FOR SELECT USING (visibility = 'public' OR auth.uid() = owner_id);

-- Favorites: Users can manage their own
CREATE POLICY favorites_owner ON favorites
  FOR ALL USING (auth.uid() = user_id);

-- Follows: Users can manage their own follows
CREATE POLICY follows_owner ON follows
  FOR ALL USING (auth.uid() = follower_id);

-- Comments: Users can manage their own, read any non-deleted
CREATE POLICY comments_owner ON comments
  FOR ALL USING (auth.uid() = author_id);

CREATE POLICY comments_read ON comments
  FOR SELECT USING (deleted_at IS NULL);
```

---

## 3. API Endpoints

### Authentication (Supabase handles these)
```
POST /auth/v1/signup
POST /auth/v1/token?grant_type=password
POST /auth/v1/token?grant_type=refresh_token
POST /auth/v1/logout
GET  /auth/v1/user
POST /auth/v1/magiclink
```

### Patterns
```
GET    /rest/v1/patterns                         # List patterns (with filters)
GET    /rest/v1/patterns?id=eq.{id}              # Get single pattern
POST   /rest/v1/patterns                         # Create pattern (auth required)
PATCH  /rest/v1/patterns?id=eq.{id}              # Update pattern (owner only)
DELETE /rest/v1/patterns?id=eq.{id}              # Delete pattern (owner only)
GET    /rest/v1/patterns?share_slug=eq.{slug}    # Get by share URL
```

### Pattern Assets (Edge Functions)
```
POST   /functions/v1/upload-pattern-image        # Get signed upload URL
POST   /functions/v1/upload-preview              # Get signed URL for thumbnail
POST   /functions/v1/generate-share-slug         # Create unique share URL
GET    /functions/v1/pattern-stats/{id}          # Increment view count
```

### Collections
```
GET    /rest/v1/collections                      # List user's collections
POST   /rest/v1/collections                      # Create collection
GET    /rest/v1/collections?id=eq.{id}           # Get collection with items
PATCH  /rest/v1/collections?id=eq.{id}           # Update collection
DELETE /rest/v1/collections?id=eq.{id}           # Delete collection
POST   /rest/v1/collection_items                 # Add pattern to collection
DELETE /rest/v1/collection_items?...             # Remove pattern from collection
```

### Favorites
```
POST   /rest/v1/favorites                        # Add favorite
DELETE /rest/v1/favorites?user_id=eq.{}&pattern_id=eq.{}  # Remove favorite
GET    /rest/v1/favorites?user_id=eq.{id}&select=pattern_id,patterns(*)  # Get user's favorites
```

### Social
```
POST   /rest/v1/follows                          # Follow user
DELETE /rest/v1/follows?follower_id=eq.{}&following_id=eq.{}  # Unfollow
GET    /rest/v1/follows?following_id=eq.{id}     # Get followers
GET    /rest/v1/follows?follower_id=eq.{id}      # Get following
```

### Comments
```
GET    /rest/v1/comments?pattern_id=eq.{id}      # Get pattern comments
POST   /rest/v1/comments                         # Add comment
DELETE /rest/v1/comments?id=eq.{id}              # Delete comment (soft)
```

### Discovery/Gallery
```
GET /rest/v1/patterns?visibility=eq.public&order=created_at.desc&limit=20
GET /rest/v1/patterns?visibility=eq.public&order=pattern_stats(favorites_count).desc
GET /rest/v1/patterns?owner_id=eq.{id}&visibility=eq.public
GET /rest/v1/tags                                # Get all tags
GET /rest/v1/pattern_tags?tag_id=eq.{id}         # Get patterns by tag
```

---

## 4. Cost Analysis

### Storage Assumptions
- Average pattern image: 120KB (PNG/WebP, not base64)
- Average patterns per user: 30
- Gallery views per user: 50/month

### Cost Projections

| Users | Patterns | Storage | Bandwidth | Monthly Cost |
|-------|----------|---------|-----------|--------------|
| 100 | 3,000 | 360 MB | 0.6 GB | **$0** (free tier) |
| 1,000 | 30,000 | 3.6 GB | 6 GB | **$25-60** |
| 10,000 | 300,000 | 36 GB | 60 GB | **$150-400** |

### Free Tier Limits (Supabase)
- Database: 500 MB
- Storage: 1 GB
- Auth: 50,000 MAU
- Edge Functions: 500K invocations/month
- Bandwidth: 2 GB

### Cost Optimization Strategies
1. **Generate thumbnails** - Serve 20KB previews in gallery, full image on detail
2. **CDN caching** - Public patterns cached at edge
3. **Cloudflare R2** - Zero egress fees at scale
4. **WebP format** - 30-50% smaller than PNG
5. **Lazy loading** and pagination

---

## 5. Security Considerations

### Rate Limiting
- **Auth endpoints**: 10 req/min per IP
- **Pattern creation**: 20 req/hour per user
- **Image uploads**: 50 MB/hour per user
- **Share token creation**: 10/hour per user
- **Comments**: 30 req/hour per user

### Image Validation (Edge Function)
```typescript
const validateImage = async (file: File) => {
  const MAX_SIZE = 2 * 1024 * 1024  // 2MB
  const ALLOWED_TYPES = ['image/png', 'image/webp', 'image/jpeg']
  const MAX_DIMENSION = 4096

  if (file.size > MAX_SIZE) throw new Error('File too large')
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Invalid type')

  // Decode and validate dimensions
  const image = await sharp(file)
  const metadata = await image.metadata()
  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new Error('Dimensions too large')
  }

  // Strip EXIF, compute hash, re-encode
  const buffer = await image.png().toBuffer()
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')

  return { buffer, hash, width: metadata.width, height: metadata.height }
}
```

### Data Protection
- Row-level security on all tables
- Signed URLs with 1-hour TTL for private images
- HTTPS everywhere
- HttpOnly cookies for auth tokens
- Service role key server-side only
- Client uses anon key with RLS

### Abuse Prevention
- Default visibility: private
- Content moderation queue for public patterns
- Report button on patterns/comments
- Soft delete with audit trail
- IP-based rate limiting
- Basic profanity filter on text fields

---

## 6. Migration Path

### Phase 1: MVP (Week 1-2)
```
1. Create Supabase project
2. Apply database schema and RLS policies
3. Configure storage bucket with access rules
4. Set up OAuth providers (Google, GitHub)
5. Add Supabase client to React app
6. Implement: Auth UI + Save/Load patterns
7. Keep GitHub Pages deployment
```

### Phase 2: Sharing (Week 3)
```
1. Add share_slug generation (Edge Function)
2. Public/private/unlisted toggle on patterns
3. Shareable URLs: tartanism.app/p/{slug}
4. Social meta tags for link previews
```

### Phase 3: Community (Week 4+)
```
1. Public pattern discovery feed
2. Favorites system with real-time counts
3. User profiles with pattern gallery
4. Collections/albums feature
5. Comments (optional)
6. Tags for discovery
```

### Phase 4: Scale (As Needed)
```
1. Migrate images to Cloudflare R2
2. Add thumbnail generation
3. Implement edge caching
4. Add analytics and monitoring
5. Consider Vercel for SSR if needed
```

---

## 7. Frontend Integration

### Install Supabase Client
```bash
npm install @supabase/supabase-js
```

### Initialize Client
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

### Auth Context
```typescript
// src/contexts/AuthContext.tsx
import { createContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export const AuthContext = createContext<{
  user: User | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}>({...})

export function AuthProvider({ children }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
```

### Save Pattern
```typescript
const savePattern = async (pattern: TartanCardData) => {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Not authenticated')

  // 1. Convert canvas to blob
  const canvas = document.getElementById('pattern-canvas') as HTMLCanvasElement
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png')
  )

  // 2. Upload image to storage
  const imagePath = `${user.id}/${pattern.id}.png`
  const { error: uploadError } = await supabase.storage
    .from('patterns')
    .upload(imagePath, blob, { upsert: true })

  if (uploadError) throw uploadError

  // 3. Save metadata to database
  const { data, error } = await supabase
    .from('patterns')
    .upsert({
      id: pattern.id,
      owner_id: user.id,
      title: pattern.name || 'Untitled Tartan',
      pattern_type: pattern.imagePattern ? 'image_based' : 'threadcount',
      threadcount: pattern.result,
      image_path: imagePath,
      visibility: 'private'
    })
    .select()
    .single()

  if (error) throw error
  return data
}
```

### Load User's Patterns
```typescript
const loadPatterns = async () => {
  const { data, error } = await supabase
    .from('patterns')
    .select(`
      *,
      pattern_stats (favorites_count, views_count)
    `)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}
```

---

## 8. Implementation Checklist

### Backend Setup
- [ ] Create Supabase project
- [ ] Apply database schema (copy SQL above)
- [ ] Apply RLS policies
- [ ] Create storage bucket "patterns" with policies
- [ ] Configure OAuth providers (Google, GitHub)
- [ ] Test auth flow (OAuth + magic link)
- [ ] Create Edge Function for share slug generation

### Frontend Integration
- [ ] Install @supabase/supabase-js
- [ ] Add environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- [ ] Create auth context/provider
- [ ] Add login/logout UI
- [ ] Implement save pattern flow
- [ ] Implement load patterns flow
- [ ] Add share functionality
- [ ] Test on GitHub Pages

### Community Features
- [ ] Public pattern feed with pagination
- [ ] Favorites toggle with optimistic UI
- [ ] User profile pages
- [ ] Search/filter patterns
- [ ] Collections CRUD
- [ ] Comments (optional)

### Production Hardening
- [ ] Rate limiting on Edge Functions
- [ ] Image validation before storage
- [ ] Error tracking (Sentry)
- [ ] Analytics (Plausible/Simple Analytics)
- [ ] Backup strategy
- [ ] Monitoring alerts

---

## Quick Start Commands

```bash
# Install Supabase CLI
npm install -g supabase

# Login and link project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
supabase db push

# Generate TypeScript types
supabase gen types typescript --local > src/types/database.ts

# Start local development
supabase start
```

---

## Key Decision Rationale

| Decision | Why |
|----------|-----|
| **Supabase over Firebase** | Open source, SQL power, better pricing at scale, no vendor lock-in |
| **PostgreSQL over MongoDB** | Tartan data is structured; relational queries for collections/favorites |
| **R2 over S3** | Zero egress fees crucial for image-heavy app |
| **REST over GraphQL** | Solo dev efficiency, Supabase auto-generates it |
| **Serverless over containers** | Zero ops, scales automatically, generous free tier |
| **OAuth + Magic Links** | Best conversion rate, no password management |

---

## Scaling Escape Hatches

If Tartanism takes off, you have clear paths:

1. **Database**: PostgreSQL is portable - can move to AWS RDS, Google Cloud SQL, or self-host
2. **Auth**: Supabase Auth can be replaced with Auth0/Clerk if needed
3. **Storage**: R2 is S3-compatible - easy migration either direction
4. **Compute**: Edge Functions can be moved to Vercel/Cloudflare Workers

---

*This specification was generated from combined research by Claude's research agent and GPT-5.2-Codex with extended reasoning. Both independently recommended Supabase as the optimal solution for Tartanism's backend needs.*
