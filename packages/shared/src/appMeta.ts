// Cross-client constants with no runtime dependencies. Client-only values are
// born here; logic that also runs inside an edge function stays in
// supabase/functions/_shared and gets a re-export facade instead (see the
// "Shared code boundary" section of the mobile monorepo design).

/** Product name as rendered by every client. */
export const APP_NAME = 'Tonus'
