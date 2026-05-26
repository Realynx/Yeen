# Move media URLs toward scoped playback tokens

The MVP uses bearer tokens stored by the web client and full JWTs in media URL query parameters where browser media elements cannot send authorization headers. The long-term target is to use scoped, short-lived playback tokens for media URLs so playback can keep working without exposing full account JWTs in URLs.
