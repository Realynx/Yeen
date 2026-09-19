# Keep downloader functionality outside Core Yeen

Core Yeen excludes torrent and download tooling so the public product remains focused on library management, Playback, Accounts, subtitles, progress, and Broadcast Sessions.

The optional Downloader Add-on owns its downloader routes, workflows, settings, clients, and user interface. Core Yeen owns only the generic add-on host seams used to install, verify, activate, and load an Add-on Package. Installing the Downloader Add-on preserves its familiar routes and user experience without making its implementation part of Core Yeen.

An Administrator uploads an Add-on Package as a ZIP in the administrator portal. Packages are signed by default. Unsigned packages can be enabled only through the explicit trust policy and warning. Installing or updating a package stages it until Add-on Activation; the Administrator chooses graceful activation, which waits for Playback to drain, or instant activation, which restarts immediately.

The Downloader Account Role remains part of Core Yeen authorization. UI and domain language use **Downloader** and **Downloaders**; the stored role code `sailer` remains an implementation detail solely for persistence compatibility.

Core-only verification must compile with the Downloader implementation omitted. Run `npm run verify:core-only` before publishing Core Yeen.
