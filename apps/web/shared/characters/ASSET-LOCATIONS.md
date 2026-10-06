# Find Cuevo artwork and videos

The design implementation checkout is `C:/Users/hp/.codex/worktrees/cuevo-design-system/Cuevo`. The other chat owns the mutable `G:/Cuevo` checkout; this chat has not copied the design patch over it.

## Artwork currently used by the app

- Asset folder `assets/`: accepted active WebP artwork, the material background, authored route SVG and local fonts.
- [Typed registry](assets.ts): one list of images consumed by Student Trail presentation.
- [Usage rules](README.md): pose meaning, single pedestal, current-scope data and static/quiet boundaries.

## Full working library outside Git

- Open `assets/library` in this folder. This local folder link exposes the complete asset workspace directly in the location the founder requested. It is ignored through local Git excludes, contains no copied files and is not a runtime import.
- Inside it, `library/expanded/utility/static` contains the 200 individual utility SVGs; `library/expanded/utility/animated` contains 200 motion SVGs; `library/expanded/utility/png` contains their size exports. Generated illustration/pose originals are under `library/expanded/generated`; individual artwork/variants are under `library/expanded/kit` as processing finishes.
- Final one-asset-per-generation sources: `library/production-individual/icons` and `library/production-individual/characters`. Their individual transparent masters, PNG/WebP sizes and 4K upscales are under `library/production-individual/transparent/icon` and `library/production-individual/transparent/character`. Current native/derivative provenance is in `library/production-individual/manifest.json`. Earlier `expanded` illustration sources are drafts, not the final separately generated originals.
- Open `.local/trail-asset-library` inside this design checkout. It is a local folder link to the one asset workspace below; files are not duplicated. It includes artwork, videos, source prompts, transparent exports and QA.
- Complete asset workspace: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation`.
- Library: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/library`.
- Original character/task artwork: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/assets/stills`.
- Individual transparent PNGs: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/library/derivatives` and `library/expanded/kit`.
- Additional icon/pose sources: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/library/expanded/generated`.
- SVG/size variants: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/library/expanded/kit`.

## Sora videos

- Native sources: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/assets/raw`.
- Delivered 1920×1080 upscaled masters: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/assets/masters`.
- Optimized web clips: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/assets/web`.
- Posters: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/assets/posters`.
- Provenance and actual dimensions: `C:/Users/hp/.codex/visualizations/2026/10/03/cuevo-trail-implementation/assets/sora-assets.json`.
- Eight additional separate Sora action clips: `library/sora-actions/raw`, optimized `web`, 1080p/4K `masters`, `posters` and `samples` under the same library link. `library/sora-actions/current-media.json` records the actual generated files; the older prep verification remains historical.

The videos are reviewed assets, not yet wired into the customer journey. Only active accepted artwork belongs in app imports. Full sources, future assets and large review outputs remain outside Git while preparation/QA continues.

Local review pages: [All assets](http://127.0.0.1:53118/) and [Sora clips](http://127.0.0.1:53116/). These work while the local review servers are running.
