# Zippy

**Ideas move faster together.**

Zippy is a lightweight, cross-platform whiteboard for sketching ideas, mapping workflows, and thinking visually. This first version focuses on a fast drawing canvas, familiar editing tools, local browser persistence, and importing/exporting drawings. Cloud accounts, cloud-saved boards, and Zippy-managed collaboration will be added in a later phase.

## Current status

- Infinite canvas with drawing, shapes, arrows, text, and image support
- Undo and redo
- Local-first saving in the browser
- Import and export of drawings and images
- Light and dark appearance options
- Responsive editor UI

Cloud saving and Zippy account management are not connected yet. Do not treat a board as cloud-backed until the Firebase integration is implemented.

## Run locally

Use Node.js 18 or newer and Yarn Classic 1.22.22, which this monorepo expects.

```bash
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install
yarn start
```

The development server normally opens the app at `http://localhost:3000`.

## Open-source notices

Zippy's drawing editor is based on [Excalidraw](https://github.com/excalidraw/excalidraw), which is distributed under the MIT License. The original MIT license and required copyright notice are retained in this repository. See [LICENSE](./LICENSE) and the individual package notices for applicable third-party terms.

Zippy branding and product changes are separate from the underlying Excalidraw project. This repository does not claim that Zippy was created by or is endorsed by the Excalidraw maintainers.
