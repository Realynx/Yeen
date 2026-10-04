# Yeen Media Server

Yeen is a self-hosted media server for managing, streaming, and sharing a personal media library across desktop, phone, and TV experiences.

## Language

**Media Item**:
A playable or cataloged piece of media in Yeen.
_Avoid_: Library Item, Title, Media

**Local Media Item**:
A **Media Item** backed by a file in a configured media library path.
_Avoid_: File, Local Title

**Remote Media Item**:
A **Media Item** from a catalog or search source that is not yet backed by a local file.
_Avoid_: Search Result, Remote Title

**Series**:
A multi-episode work that groups related **Episodes**.
_Avoid_: Show

**Episode**:
A **Media Item** with season and episode metadata that belongs to a **Series**.
_Avoid_: Show Item, Series Item

**Movie**:
A standalone video **Media Item** that does not belong to a **Series**.
_Avoid_: Video, Title

**Other Media Item**:
An uncategorized **Media Item** that should be cleaned up by metadata assignment when possible.
_Avoid_: Misc Title, Unknown Video

**Music Mode**:
The product mode for browsing and playing the **Music Library**; it is remembered independently of the selected visual theme.
_Avoid_: Music Theme, Audio Skin

**Music Library**:
The music-only view of the **Media Library**, selected by Library Type `music`.
_Avoid_: Playlist, Music Folder

**Music Media Item**:
A **Local Media Item** cataloged under Library Type `music` and backed by an audio file.
_Avoid_: Video, Generic Other Media

**Track**:
A playable **Music Media Item** with optional Artist, Album, disc, track, genre, duration, and artwork metadata.
_Avoid_: Song when the recording may not be a song

**Remote Track**:
A **Remote Media Item** describing a recording discovered through a remote music source. It can match a local Track but is not playable from the Music Library until backed by a local audio file.
_Avoid_: Download, Spotify Track when Spotify is only one source

**Music Discovery**:
The Core Yeen experience that presents remote Tracks from search, charts, and trending metadata without acquiring their audio.
_Avoid_: Download Search, Music Store

**Music Acquisition**:
An explicit Downloader Add-on workflow that obtains audio from an identified external source and imports it into a Music Location as a local Track.
_Avoid_: Spotify Download, Core Download

**Album**:
Music metadata that groups related **Tracks**; it is not yet a separately persisted catalog entity.
_Avoid_: Music Folder

**Artist**:
The credited performer metadata for a **Track** or **Album**.
_Avoid_: Account, Author

**Library Type**:
The catalog discriminator that separates video and music product experiences without guessing from file extensions or codecs. Stored values are `video` and `music`.
_Avoid_: Theme, MIME Type, Digital Media Type

**Metadata Assignment**:
The act of correcting Movie, Series, Episode, artwork, description, and episode metadata for a **Media Item**.
_Avoid_: Metadata Matching, Metadata Editing

**Filesystem Commit**:
An approved action that applies rename, move, or NFO changes to disk.
_Avoid_: Metadata Assignment

**Remote Metadata Provider**:
An optional **Core Yeen** integration that enriches **Metadata Assignment** when configured.
_Avoid_: Metadata Add-on

**AI Metadata Provider**:
An optional **Core Yeen** integration that assists **Metadata Assignment** when configured.
_Avoid_: AI Add-on

**Account**:
A person's login identity in Yeen, with profile, role, invites, and preferences.
_Avoid_: User

**Account Invite**:
A one-time invitation that lets a new person create an **Account** and records the inviting **Account**.
_Avoid_: Invite, Registration Token

**TV Pairing**:
A flow that links a TV client to an existing **Account** using a short code.
_Avoid_: TV Login Code, Device Invite

**Account Role**:
A permission level assigned to an **Account**.
_Avoid_: User Role

**Administrator**:
An **Account Role** that can manage system settings and accounts.
_Avoid_: Admin User

**Downloader**:
An **Account Role** that can access optional download tools.
_Avoid_: Sailer

**Standard Account**:
An **Account Role** that can browse and play media.
_Avoid_: Standard User

**Core Yeen**:
The default open-source product surface for library management, playback, accounts, subtitles, progress, and broadcast.
_Avoid_: Full Yeen, Base App

**Downloader Add-on**:
An optional add-on that owns torrent and download tooling outside default **Core Yeen**.
_Avoid_: Torrent Core, Built-in Downloader

**Add-on Package**:
A ZIP archive uploaded by an **Administrator** to install or update an add-on. Packages are signed by default; an **Administrator** may explicitly allow an unsigned package after accepting its trust warning.
_Avoid_: Plugin Zip, Extension Archive

**Add-on Activation**:
The controlled restart that makes a staged **Add-on Package** active. An **Administrator** can choose a graceful activation that waits for Playback to drain or an instant activation that interrupts it.
_Avoid_: Hot Reload, Plugin Reboot

**Broadcast Session**:
A session where one **Account** shares synchronized playback of a **Media Item** to public viewers through a share token.
_Avoid_: Watch Party, Shared Watch

**Broadcast Viewer**:
A person watching a **Broadcast Session** through a share token; they do not need an **Account**.
_Avoid_: User, Guest Account

**Broadcast Share Token**:
A tokenized link credential that grants access to a **Broadcast Session**.
_Avoid_: Invite Token, TV Pairing Code

**Media Library**:
The collection of **Local Media Items** known to Yeen.
_Avoid_: Media Folder, Library Path

**Media Location**:
A configured filesystem root plus its explicit **Library Type**, scanned by Yeen to discover **Local Media Items**. Video locations index supported video files; Music locations index supported audio files. Legacy locations stored as plain path strings are read as Library Type `video` so existing installations keep their libraries without data loss.
_Avoid_: Library, Media Library

**Media Scan**:
The process that discovers or refreshes **Local Media Items** from **Media Locations**.
_Avoid_: Index, Import

**Media Catalog**:
The persisted metadata index of known **Local Media Items**.
_Avoid_: Scan, media-index.json

**Playback**:
An **Account** or **Broadcast Viewer** playing a **Media Item**.
_Avoid_: Streaming

**Direct Play**:
**Playback** that uses the original media file without server-side conversion.
_Avoid_: Direct Stream, Streaming

**Transcoded Playback**:
**Playback** that uses server-side conversion, usually through an HLS session.
_Avoid_: HLS Playback, Streaming

**Subtitle Track**:
Timed text available for **Playback**.
_Avoid_: Caption

**Embedded Subtitle Track**:
A **Subtitle Track** stored inside a media file.
_Avoid_: Internal Caption

**External Subtitle Track**:
A **Subtitle Track** stored beside a media file.
_Avoid_: Sidecar Caption

**Subtitle Extraction**:
The process of converting an **Embedded Subtitle Track** into a playable WebVTT file.
_Avoid_: Subtitle Download, Caption Burn

**Subtitle Lookup Provider**:
An optional **Core Yeen** integration that finds external **Subtitle Tracks** when configured.
_Avoid_: Subtitle Add-on

**Watch Progress**:
An **Account**'s saved playback position and completion state for a **Media Item**.
_Avoid_: Playback State

**Playback Preferences**:
An **Account**'s saved audio and subtitle language choices for **Playback**.
_Avoid_: Watch Progress

**Home Feed**:
The ordered rows shown on Home for a **Client Experience**.
_Avoid_: Dashboard Rows, Home Page State

**Home Curation**:
The policy that builds a **Home Feed** from the **Media Library**, **Watch Progress**, and Account-specific Home choices.
_Avoid_: Home Page Logic, Dashboard Logic

**Client Experience**:
A device-oriented UX variant for using **Core Yeen**.
_Avoid_: Responsive Breakpoint

**Desktop Experience**:
The **Client Experience** optimized for desktop browsers.
_Avoid_: Desktop Breakpoint

**Phone Experience**:
The **Client Experience** optimized for phone browsers.
_Avoid_: Mobile Breakpoint

**TV Experience**:
The **Client Experience** optimized for TV browsers or native TV apps.
_Avoid_: TV Breakpoint

## Relationships

- A **Media Item** is either a **Local Media Item** or a **Remote Media Item**.
- A **Local Media Item** is backed by a media file.
- A **Remote Media Item** is not backed by a local file yet.
- A **Series** groups one or more **Episodes**.
- An **Episode** belongs to a **Series**.
- A **Movie** is a standalone **Media Item**.
- An **Other Media Item** is a temporary fallback category for a **Media Item**.
- **Metadata Assignment** can turn an **Other Media Item** into a **Movie** or **Episode**.
- **Music Mode** presents only the **Music Library** and remains distinct from visual theme selection.
- The **Music Library** contains **Music Media Items** whose Library Type is `music`.
- A **Track** is a playable **Music Media Item**.
- A **Remote Track** is a **Remote Media Item** and can be linked to a matching local Track.
- **Music Discovery** can present **Remote Tracks** without making them local or playable.
- **Music Acquisition** belongs to the **Downloader Add-on** and can turn a selected **Remote Track** into a local Track through Local Media Item intake.
- A **Track** has zero or one Album and zero or more credited Artists in domain meaning; the current catalog stores a primary artist string.
- An **Album** groups zero or more **Tracks** through metadata and is not yet a separately persisted entity.
- Library Type `video` remains the default for existing catalog records and API requests that omit the discriminator.
- Digital Media Type describes the underlying stream (`audio`, `video`, and so on); **Library Type** selects the product experience.
- A **Filesystem Commit** can apply metadata-related file changes to disk.
- A **Remote Metadata Provider** can enrich **Metadata Assignment**.
- An **AI Metadata Provider** can assist **Metadata Assignment**.
- An **Account** can browse and play **Media Items** according to its role.
- An **Account** has exactly one **Account Role**.
- An **Administrator** can manage system settings and accounts.
- A **Downloader** can access optional download tools.
- A **Standard Account** can browse and play **Media Items**.
- **Core Yeen** excludes torrent and download tooling by default.
- The **Downloader Add-on** owns torrent and download tooling.
- A **Downloader** can access the **Downloader Add-on** when it is installed or enabled.
- An **Administrator** installs a **Downloader Add-on** from an **Add-on Package**.
- An **Add-on Package** is signed unless an **Administrator** explicitly enables unsigned packages.
- An installed or updated **Add-on Package** remains staged until **Add-on Activation**.
- Graceful **Add-on Activation** waits for active **Playback** and **Broadcast Sessions** to drain.
- Instant **Add-on Activation** can interrupt active **Playback** and **Broadcast Sessions**.
- **Broadcast** is its own **Core Yeen** feature boundary.
- A **Broadcast Session** is started by an **Account**.
- A **Broadcast Session** shares playback of one **Media Item**.
- A **Broadcast Session** has one **Broadcast Share Token**.
- A **Broadcast Session** has zero or more **Broadcast Viewers**.
- A **Broadcast Viewer** may be anonymous or may also have an **Account**.
- A **Broadcast Viewer** uses a **Broadcast Share Token** to access a **Broadcast Session**.
- A **Media Library** contains zero or more **Local Media Items**.
- A **Media Library** can be discovered from multiple **Media Locations**.
- A **Media Location** can contain zero or more **Local Media Items**.
- A **Media Scan** reads one or more **Media Locations**.
- A **Media Scan** updates the **Media Catalog**.
- The **Media Catalog** describes **Local Media Items**.
- An **Account Invite** is created by an **Account**.
- An **Account Invite** creates one new **Account**.
- **TV Pairing** links a TV client to one existing **Account**.
- **Playback** plays one **Media Item**.
- **Playback** is either **Direct Play** or **Transcoded Playback**.
- **Direct Play** uses the original media file.
- **Transcoded Playback** uses server-side conversion.
- **Playback** can include zero or more **Subtitle Tracks**.
- A **Subtitle Track** is either an **Embedded Subtitle Track** or an **External Subtitle Track**.
- **Subtitle Extraction** creates a playable WebVTT file from an **Embedded Subtitle Track**.
- A **Subtitle Lookup Provider** can find external **Subtitle Tracks**.
- An **Account** can have **Watch Progress** for a **Media Item**.
- An **Account** can have **Playback Preferences** for **Playback**.
- **Home Curation** produces a **Home Feed** for a **Client Experience**.
- A **Home Feed** can include **Media Items** selected from **Watch Progress** and the **Media Library**.
- **Core Yeen** supports **Desktop Experience**, **Phone Experience**, and **TV Experience**.
- Each **Client Experience** can present the same **Core Yeen** features with different navigation and controls.

## Example dialogue

> **Dev:** "When a **Media Item** appears in search, does it have to be playable?"
> **Domain expert:** "No. A **Remote Media Item** can be browsed before it becomes a **Local Media Item**."
>
> **Dev:** "Is this 'show' record the whole series or one episode?"
> **Domain expert:** "Say **Series** for the whole work and **Episode** for the individual **Media Item**."
>
> **Dev:** "Should I call this uncategorized MKV a video?"
> **Domain expert:** "No. If it is not identified as a **Movie** or **Episode**, call it an **Other Media Item** until metadata assignment cleans it up."
>
> **Dev:** "Does assigning metadata rename the file immediately?"
> **Domain expert:** "No. **Metadata Assignment** corrects the catalog; a **Filesystem Commit** applies approved file changes to disk."
>
> **Dev:** "Is TMDB part of the Downloader Add-on?"
> **Domain expert:** "No. TMDB is a **Remote Metadata Provider**, an optional **Core Yeen** integration."
>
> **Dev:** "Is AI metadata required for the catalog?"
> **Domain expert:** "No. An **AI Metadata Provider** can assist **Metadata Assignment** when configured."
>
> **Dev:** "Is the admin panel managing users or accounts?"
> **Domain expert:** "Say **Accounts** when referring to Yeen login identities."
>
> **Dev:** "Is this invite the same as a TV pairing code?"
> **Domain expert:** "No. Say **Account Invite** for account creation invitations."
>
> **Dev:** "Does the TV code create a new account?"
> **Domain expert:** "No. **TV Pairing** links a TV client to an existing **Account**."
>
> **Dev:** "Does the `sailer` role mean anything in domain language?"
> **Domain expert:** "No. Say **Downloader** for the role that can access download tools."
>
> **Dev:** "Should torrent download screens be part of default Yeen?"
> **Domain expert:** "No. They belong to the **Downloader Add-on**, not **Core Yeen**."
>
> **Dev:** "Does a Track in Discover mean Yeen can play it?"
> **Domain expert:** "No. It is a **Remote Track** until a local audio file backs it. **Music Discovery** does not acquire audio."
>
> **Dev:** "Should source-specific acquisition live in Core Yeen?"
> **Domain expert:** "No. Source matching and **Music Acquisition** belong to the **Downloader Add-on**; Core owns only provider-neutral discovery and add-on seams."
>
> **Dev:** "Can I install the Downloader Add-on by copying its files into Core Yeen?"
> **Domain expert:** "No. Upload an **Add-on Package** through the administrator portal; unsigned packages require an explicit trust setting."
>
> **Dev:** "Will uploading an Add-on Package interrupt a movie?"
> **Domain expert:** "Not by itself. Choose graceful **Add-on Activation** to wait for Playback to finish, or instant activation to restart immediately."
>
> **Dev:** "Should I call this a watch party?"
> **Domain expert:** "No. The canonical term is **Broadcast Session**."
>
> **Dev:** "Does someone watching a broadcast need an account?"
> **Domain expert:** "No. A **Broadcast Viewer** can watch through the share token without an **Account**."
>
> **Dev:** "Is the broadcast token an account invite?"
> **Domain expert:** "No. It is a **Broadcast Share Token** for one **Broadcast Session**."
>
> **Dev:** "Is the library the folder path?"
> **Domain expert:** "No. The **Media Library** is the collection Yeen knows about; each folder path is a **Media Location**."
>
> **Dev:** "Did the scan disappear when the server restarted?"
> **Domain expert:** "The **Media Scan** is the process; the **Media Catalog** is the persisted result."
>
> **Dev:** "Should we call all playback streaming?"
> **Domain expert:** "No. Say **Playback** for the user activity, **Direct Play** for original-file playback, and **Transcoded Playback** when server-side conversion is needed."
>
> **Dev:** "Is extracting subtitles the same as downloading subtitles?"
> **Domain expert:** "No. **Subtitle Extraction** converts an **Embedded Subtitle Track** into WebVTT for playback."
>
> **Dev:** "Does Core Yeen require OpenSubtitles?"
> **Domain expert:** "No. OpenSubtitles is a **Subtitle Lookup Provider**, an optional **Core Yeen** integration."
>
> **Dev:** "Are saved subtitle language choices watch progress?"
> **Domain expert:** "No. Position and completion are **Watch Progress**; audio and subtitle choices are **Playback Preferences**."
>
> **Dev:** "Are phone and TV just CSS breakpoints?"
> **Domain expert:** "No. They are first-class **Client Experiences** with their own navigation and controls."

## Flagged ambiguities

- Resolved: remote/catalog-only results are **Remote Media Items**, not a separate top-level concept.
- Resolved: use **Series** and **Episode** in domain language; treat code enum value `show` as implementation wording.
- Resolved: use **Movie** for standalone video works; reserve **Other Media Item** for uncategorized fallback records.
- Resolved: use **Music Mode** for the remembered product mode and **Music Library** for the music-only catalog view; neither is a visual theme.
- Resolved: use **Track** for a playable **Music Media Item**; Album and Artist are metadata rather than separately persisted entities for now.
- Resolved: use **Remote Track** for a catalog-only recording; **Music Discovery** belongs to Core Yeen, while **Music Acquisition** belongs to the Downloader Add-on.
- Resolved: **Library Type** (`video` or `music`) selects the product experience, while Digital Media Type describes the underlying stream.
- Resolved: distinguish **Metadata Assignment** from **Filesystem Commit**.
- Resolved: **Remote Metadata Providers** are optional **Core Yeen** integrations.
- Resolved: **AI Metadata Providers** are optional **Core Yeen** integrations for now.
- Resolved: use **Account** for login identities; treat code type `User` as implementation wording.
- Resolved: use **Account Invite** for one-time invitations to create accounts.
- Resolved: use **TV Pairing** for linking a TV client to an existing **Account** with a short code.
- Resolved: use **Downloader** in domain and UI language; the stored Account Role code `sailer` remains only for persistence compatibility.
- Resolved: torrent and download tooling belongs to the external **Downloader Add-on**, never the public **Core Yeen** implementation.
- Resolved: add-ons are installed from an **Add-on Package**; signed packages are the default, while unsigned packages require an explicit administrator setting and trust warning.
- Resolved: use **Add-on Activation** for the restart that promotes a staged package; administrators choose graceful drain or instant interruption.
- Resolved: use **Broadcast Session** for share-token synchronized playback.
- Resolved: **Broadcast** is its own **Core Yeen** feature boundary, not a subfeature of Player or Media.
- Resolved: **Broadcast Viewers** can be anonymous or account-holding people; they do not need an **Account**.
- Resolved: use **Broadcast Share Token** for tokenized broadcast access links.
- Resolved: **Media Library** is the indexed collection; **Media Location** is a configured filesystem root, and multiple locations are supported.
- Resolved: **Media Scan** is the discovery/refresh process; **Media Catalog** is the persisted metadata index.
- Resolved: use **Playback** as the domain umbrella; **Direct Play** and **Transcoded Playback** are the domain playback modes.
- Resolved: use **Subtitle Track** with **Embedded Subtitle Track**, **External Subtitle Track**, and **Subtitle Extraction**.
- Resolved: **Subtitle Lookup Providers** are optional **Core Yeen** integrations.
- Resolved: separate **Watch Progress** from **Playback Preferences**.
- Resolved: **Home Curation** owns the policy for building the **Home Feed** per **Client Experience**.
- Resolved: **Home Curation** owns Account-specific Home choices such as hiding **Media Items** from the **Home Feed** behind adapters.
- Resolved: **Home Feed** is media-derived; non-media install prompts and TV hints belong to **Client Experience** chrome.
- Resolved: **Home Feed** rows use stable semantic identity so **TV Experience** focus and tests do not depend on page order.
- Resolved: do not define **Playback Session** until Yeen tracks active per-device viewing sessions as first-class domain records.
- Resolved: **Desktop Experience**, **Phone Experience**, and **TV Experience** are first-class **Client Experiences**, not just responsive breakpoints.
