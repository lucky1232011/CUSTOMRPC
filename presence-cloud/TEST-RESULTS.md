# Build status

The Social SDK C++ worker source, OAuth flow and Docker build path were added. No compile, test suite or live Discord login was run in this environment.

The local environment does not include a C++ compiler, CMake, Docker, Android SDK or an installed Linux environment. The downloaded Discord SDK archive provides the Linux x86_64 library and is available in the ignored local `worker/vendor/` folder. The source is ready for a Linux/Docker build after configuring OAuth secrets and an enabled persistent host.

Live OAuth and Rich Presence still require the Developer Portal client secret, approval for the requested `sdk.social_layer_presence` scope, and a deployed HTTPS origin with the exact `/auth/callback` redirect registered. No website has been deployed.

