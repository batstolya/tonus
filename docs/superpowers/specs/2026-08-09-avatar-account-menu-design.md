# Avatar account menu

## Goal

Reduce visual noise in the desktop topbar by moving secondary account controls
behind the user's avatar. The interaction follows the familiar account-menu
pattern shown in the Mate reference, while the appearance remains native to
Tonus.

## Scope

On desktop, remove the separate language, theme, settings, and sign-out controls
from the topbar. Keep health/status controls in the topbar: the focus progress,
streak, notification bell, and any existing contextual badges.

The avatar becomes the trigger for one account menu. The existing mobile burger
menu remains unchanged.

## Account menu

The menu is anchored below the avatar and contains, in order:

1. The signed-in user's email in a non-interactive header.
2. A language row with the current language shown on the right.
3. A theme row with the current mode shown on the right.
4. A settings row that navigates to the existing settings screen.
5. A visually separated sign-out row using the existing sign-out behavior.

Selecting language or theme reveals that control's available options inside the
same popover. Selecting a value applies it through the existing language/theme
state and returns to the main menu. This avoids stacked or side-by-side popovers.

The menu closes when the user selects settings or sign-out, clicks outside it,
or presses Escape. Only one account-menu panel is open at a time. The trigger
exposes its expanded state to assistive technology, and all menu actions remain
keyboard reachable.

## Visual treatment

Use the existing Tonus design tokens for background, border, text, muted text,
accent, shadow, radii, and spacing. Reuse the project's icon system. The menu
should feel like a Tonus surface rather than a visual copy of Mate.

The avatar keeps its current size and image-loading behavior. Its active/open
state receives the same restrained border or focus treatment used by other
topbar controls. The email may truncate rather than widen the popover beyond a
mobile-safe maximum width.

## Component boundaries

Extend the current `TopbarAvatar` entry point into a focused account-menu
component. It receives the current user, language and theme values, their
setters, the settings navigation callback, and the existing sign-out callback.
`App` remains responsible for application state and navigation; the menu owns
only its open panel and active language/theme subview.

The existing desktop `ThemeMenu` and language popover are removed from the
topbar composition, but their underlying state hooks and behavior are reused.
The mobile drawer continues to use its current controls.

## Verification

Component behavior tests cover opening and closing the menu, rendering the
email, changing language and theme, navigating to settings, signing out, outside
click, and Escape. Existing application behavior tests confirm the mobile drawer
still works. Run the focused tests, the web test suite, and the Node 24 production
build. Check the desktop topbar and account menu visually in light and dark
themes, plus the mobile header to ensure it did not regress.

## Out of scope

- Redesigning the mobile drawer.
- Changing profile data or avatar upload behavior.
- Reordering or redesigning progress, streak, notification, or contextual badges.
- Copying Mate colors, typography, spacing, or menu content beyond the agreed
  information architecture.
