# Elgato Marketplace

Nothing here is automated and nothing needs a secret in this repo. The
release workflow produces the `.streamDeckPlugin`; a person uploads it.

## Before the first submission

1. **Maker account.** Sign in at https://maker.elgato.com with the Elgato
   account that owns the plugin. Fill in the maker profile (name, support
   email, website `https://github.com/Andriiklymiuk/agent-deck`).
2. **Plugin identity.** Register the UUID `com.andriiklymiuk.agent-deck`
   under that maker. Elgato ties the UUID to the account; nobody else can
   publish updates for it afterwards.
3. **Validate locally.** `npm run validate` must print `Validation
   successful`. The manifest already carries `Author`, `Description`,
   `Category` + `CategoryIcon` (28×28 / 56×56), `Icon` for the marketplace
   listing (256×256 / 512×512), the action icons (20×20 / 40×40) and key
   images (72×72 / 144×144), all under `com.andriiklymiuk.agent-deck.sdPlugin/imgs/`.
4. **Debug off for a store build.** `Nodejs.Debug` in `manifest.json` opens
   an inspector port. Set it to `"disabled"` in the commit you submit; a
   store build should not listen on a port.

## Each release

1. Bump `package.json` (`npm version patch --no-git-tag-version`), commit,
   push `main`. CI tags `v<version>`, packs with that version (the
   manifest's `Version` becomes `<version>.0`) and attaches the
   `.streamDeckPlugin` to the GitHub Release.
2. Download that file from the release.
3. At https://maker.elgato.com → *Products* → *Agent Deck* → **New version**:
   upload it, paste the release notes, submit for review. Reviews take a
   few working days; a rejection comes with the reason by email.

## Listing copy (draft)

- **Name:** Agent Deck
- **Tagline:** Every Claude Code session on its own key.
- **Description:** the first two paragraphs of README.md.
- **Keywords:** claude, claude code, ai, agent, terminal, vs code, corgi
- **Media** (all from `npm run showcase`, in `docs/media/store/`):
  - Icon (288×288): `icon-288.png`
  - Thumbnail (1920×960): `mk2.png`
  - Gallery (1920×960, three or more): `mini.png`, `talk.png`, `states.png`,
    and `mk2.png` again; `pulse.mp4` (1920×1080) as the video item.
- **Requirements to state:** macOS 12+, Stream Deck app 7.1+, corgi
  (`brew install andriiklymiuk/homebrew-tools/corgi`), Claude Code.
