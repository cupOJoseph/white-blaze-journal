# White Blaze Journal

An interactive map of 53 posts from a 2019 Appalachian Trail journal. The 49 trail notes appear in mapped south-to-north order; four pre-hike notes remain available in the journal, including the Colorado post outside the default East Coast view.

Open `dist/index.html` in a browser, or serve `dist/` with any static HTTP server. An internet connection is needed for the map library, OpenStreetMap tiles, and the detailed A.T. route.

The detailed route comes from the [Appalachian Trail Conservancy and National Park Service ArcGIS layers](https://appalachiantrail.org/experience/interactive-map/). If those layers are unavailable, the page labels and shows an illustrative route. Post coordinates, dates, titles, text, and image URLs were extracted from the supplied `trail posts.md`; the parser is in `work/parse_posts.py`. The source has two undated Massachusetts posts and a few inconsistent date/location entries, so the animation follows mapped south-to-north order and displays original dates without changing them.
