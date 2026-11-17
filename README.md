# White Blaze Journal

An interactive map of 53 posts from a 2019 Georgia-to-Maine Appalachian Trail hike. The entries stop in Vermont. The 49 trail notes appear in mapped south-to-north order; four pre-hike notes remain available in the journal, including the Colorado post outside the default East Coast view.

Visit the [hosted map](https://cupojoseph.github.io/white-blaze-journal/), open `docs/index.html` locally, or serve `docs/` with any static HTTP server. GitHub Pages publishes the `docs/` folder from `main`. An internet connection is needed for the map library, OpenStreetMap tiles, and the detailed A.T. route.

The post data lives in `jsons/posts.json`; `docs/posts.js` is the browser-ready copy. To regenerate both from the original source, run `python3 work/parse_posts.py "/path/to/trail posts.md"`. The detailed route comes from the [Appalachian Trail Conservancy and National Park Service ArcGIS layers](https://appalachiantrail.org/experience/interactive-map/). If those layers are unavailable, the page labels and shows an illustrative route. The source has two undated Massachusetts posts and a few inconsistent date/location entries, so the animation follows mapped south-to-north order and displays original dates without changing them.
