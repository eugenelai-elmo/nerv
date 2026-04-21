#!/bin/sh
set -e

REPO="eugenelai-elmo/ai-kernel"
INSTALL_DIR="/usr/local/bin"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

# Normalise arch names
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
esac

BINARY_NAME="ai-kernel-${OS}-${ARCH}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BINARY_NAME}"

echo "Downloading ai-kernel for ${OS}/${ARCH}..."
curl -fsSL "$DOWNLOAD_URL" -o "/tmp/ai-kernel"
chmod +x "/tmp/ai-kernel"

echo "Installing to ${INSTALL_DIR}/ai-kernel (may require sudo)..."
if [ -w "$INSTALL_DIR" ]; then
  mv "/tmp/ai-kernel" "${INSTALL_DIR}/ai-kernel"
else
  sudo mv "/tmp/ai-kernel" "${INSTALL_DIR}/ai-kernel"
fi

echo "✓ ai-kernel installed: $("${INSTALL_DIR}/ai-kernel" --version)"
