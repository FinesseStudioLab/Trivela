#!/bin/bash
# Install Node.js and Git via MacPorts. Run in Terminal (you'll be asked for your password).
# Do NOT type the $ — that's your shell prompt.

set -e
echo "Installing Git and Node.js with MacPorts (sudo required)..."
sudo /opt/local/bin/port -v selfupdate
sudo /opt/local/bin/port install git
sudo /opt/local/bin/port install nodejs20
echo ""
echo "Done. Add MacPorts to PATH if needed:"
echo '  export PATH="/opt/local/bin:$PATH"'
echo ""
echo "Then verify:"
echo "  git --version"
echo "  node --version"
