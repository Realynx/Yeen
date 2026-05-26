# Use dev-friendly and production-strict security defaults

Yeen should stay easy to run in development, but production deployments must require explicit safe security configuration. Development may use permissive defaults, while production requires a non-default `JWT_SECRET` and explicit CORS origins unless the web UI is served from the same origin as the Nest process.
