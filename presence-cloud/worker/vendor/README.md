# Install the Discord Social SDK (private deployment dependency)

The Linux worker uses Discord Social SDK 1.10.19337. SDK binaries and headers are intentionally excluded from this repository. Put the package contents here before building:

- `worker/vendor/include/discordpp.h`
- `worker/vendor/include/cdiscord.h`
- `worker/vendor/lib/libdiscord_partner_sdk.so`

The supplied archive has these files under `discord_social_sdk/`. Copy the two headers and Linux x86_64 shared library from that folder. Keep the SDK license notices with your private deployment files and follow Discord's SDK terms. Then build the image from the repository root with `docker build -f worker/Dockerfile -t presence-cloud .`.

The Linux image must run on x86_64. The worker is a distinct long-lived process in the app container, not browser JavaScript. Configure the OAuth and encryption environment variables described in the root README before exposing it publicly.

