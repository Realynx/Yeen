# Keep downloader functionality outside Core Yeen

Core Yeen excludes torrent and download tooling by default so the open-source product remains focused on library management, playback, accounts, subtitles, progress, and broadcast. Downloader functionality belongs in an optional Downloader Add-on; the current built-in torrent/download code is implementation drift that should be extracted later rather than expanded further inside core.
