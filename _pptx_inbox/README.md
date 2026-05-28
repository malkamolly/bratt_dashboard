# PPTX Inbox

Temporary holding pen for PowerPoint files being converted into topic
decks. **Not part of the app.**

## How this folder is used

1. Drop `.pptx` files here, commit, and push.
2. Claude reads them out of this folder, generates an inventory in
   `INVENTORY.md`, and we work from that to decide what to convert.
3. Each converted deck becomes a topic deck under
   `/content/topics/<slug>.txt` with assets in
   `/public/topics/<slug>/`.
4. When everything in the inbox has been processed (or rejected),
   this whole folder gets deleted.

Filenames don't need to be cleaned up before uploading — the original
names give Claude useful hints about each deck's topic.
