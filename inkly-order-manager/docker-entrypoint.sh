#!/bin/bash
set -e

# Start Xvfb (virtual framebuffer) on display :99
# Screen 0: 1280x800 resolution, 24-bit color depth
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
sleep 1
export DISPLAY=:99

# Execute the main application
exec "$@"
