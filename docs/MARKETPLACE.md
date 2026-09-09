# Elgato Marketplace

Nothing here is automated and nothing needs a secret in this repo. The
release workflow produces the `.streamDeckPlugin`; a person uploads it.

## Before the first submission

1. **Maker account.** Sign in at https://maker.elgato.com with the Elgato
   account that owns the plugin. Fill in the maker profile (name, support
   email, website `https://github.com/Andriiklymiuk/corgi-agent-deck`).
2. **Plugin identity.** Register the UUID `com.andriiklymiuk.corgi-agent-deck`
   under that maker. Elgato ties the UUID to the account; nobody else can
   publish updates for it afterwards.
3. **Validate locally.** `npm run validate` must print `Validation
   successful`. The manifest already carries `Author`, `Description`,
   `Category` + `CategoryIcon` (28×28 / 56×56), `Icon` for the marketplace
   listing (256×256 / 512×512), the action icons (20×20 / 40×40) and key
   images (72×72 / 144×144), all under `com.andriiklymiuk.corgi-agent-deck.sdPlugin/imgs/`.
4. **No `Nodejs.Debug` in the manifest.** Stream Deck passes its value to node as a flag: `"enabled"` and `--inspect=…` work, anything else ("disabled") makes node look for a script by that name and the plugin never starts. Leave the key out; `streamdeck pack` strips it anyway.
