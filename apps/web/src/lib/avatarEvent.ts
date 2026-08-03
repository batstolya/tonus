// The settings preview and the topbar draw the same photo from separate state,
// and they live in different trees. Whoever changes it says so; the other
// re-reads. Same shape as the focus-card flag.
export const AVATAR_CHANGED = 'tonus:avatar-changed'
